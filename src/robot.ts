import OpenAI from "openai";
import {getChatPrompt, userJoinedChat} from "./chatPrompt";
import { RemotePlayer, RemotePlayerInterface } from "@workadventure/iframe-api-typings/play/src/front/Api/Iframe/Players/RemotePlayer";

// TODO: import this file ONLY in robot mode
class Robot {
    private mode: "waiting" | "chatting" = "waiting";
    private openai!: OpenAI;
    private chatHistory: Array<{role: "system" | "assistant", content: string} | {role: "user", player: RemotePlayerInterface, content: string}> = [];

    init() {
        console.log("Robot is starting...");

        this.openai = new OpenAI({
            dangerouslyAllowBrowser: true,
            apiKey: '',
        });

        WA.player.proximityMeeting.onJoin().subscribe((users) => {
            // When we join a proximity meeting, we start chatting
            this.mode = "chatting";

            this.startChat();
        });

        WA.player.proximityMeeting.onParticipantJoin().subscribe((user) => {
            this.remotePlayerJoined(user);
        });

        WA.player.proximityMeeting.onLeave().subscribe(() => {
            // When we leave a proximity meeting, we stop chatting
            this.mode = "waiting";
        });

        WA.chat.onChatMessage((message, event) => {
            (async () => {
                if (this.mode !== "chatting") {
                    console.warn("Received a chat message while not in chatting mode: ", message, event);
                    return;
                }

                if (!event.author) {
                    // We are receiving our own message, let's ignore it.
                    return;
                }

                this.chatHistory.push({
                    role: "user",
                    player: event.author,
                    content: event.author.name + ": " + message,
                });

                const response = await this.triggerGpt();

                WA.chat.sendChatMessage(response, 'Le séducteur');
            })().catch(e => console.error(e));
        }, {
            scope: "bubble",
        });
    }

    private async startChat() {

        if (this.chatHistory.length === 0) {
            const chatPrompt = await getChatPrompt();

            console.log("Sending prompt: ", chatPrompt);

            // TODO: only trigger the full script on first start
            // For subsequent starts, we should only send the new information about users.

            this.chatHistory = [{
                role: "system",
                content: chatPrompt,
            }];

            const response = chatPrompt //await this.triggerGpt();

            WA.chat.sendChatMessage(response, {
                scope: "bubble",
            });
        }
    }

    private async triggerGpt() {
        const messages = this.chatHistory.map(message => {
            return {
                role: message.role,
                content: message.role === "user" ? message.player.name + ": " + message.content : message.content,
            }
        });

        WA.chat.startTyping({
            scope: "bubble",
        });

        const chatCompletion = await this.openai.chat.completions.create({
            messages,
            model: 'gpt-3.5-turbo',
        });

        const response = chatCompletion.choices[0]?.message.content;
        if (response === null || response === undefined) {
            throw new Error("OpenAI returned no response: " + JSON.stringify(chatCompletion))
        }
        console.log("OpenAI response:", response);

        WA.chat.stopTyping({
            scope: "bubble",
        });

        this.chatHistory.push({
            role: "assistant",
            content: response,
        });

        return response;
    }

    private async remotePlayerJoined(user: RemotePlayer) {
        // TODO: properly throttle this by adding players joining to a queue
        if (this.mode === "chatting") {
            this.chatHistory.push({
                role: "system",
                content: userJoinedChat(user),
            });

            const response = await this.triggerGpt();

            WA.chat.sendChatMessage(response, {
                scope: "bubble",
            });
        }
    }
}

export const robot = new Robot();