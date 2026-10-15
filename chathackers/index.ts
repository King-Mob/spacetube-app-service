import { Express } from "express";


export function startChatHackers(app: Express) {
    console.log("chat hackers started")
}

export function sendChatHackersMessage(name: string, message: string, roomId: string) {
    console.log("message sent")
}

