import { Express, Request, Response } from "express";


export function startChatHackers(app: Express) {
    console.log("chat hackers started")

    app.post("/chathackers", (req: Request, res: Response) => {
        console.log(req.body);

        res.send("great stuff")
    })
}

export function sendChatHackersMessage(name: string, message: string, roomId: string) {
    console.log("message sent")
}

