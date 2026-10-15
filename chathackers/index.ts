import {
    getTubeRoomLinkByChannelId,
    insertChannelTubeRoomLink,
    insertInviteTubeRoomLink,
    getInviteCodeByTubeId,
    getInviteTubeRoomLink,
    deleteChannelTubeRoomLinks,
    getTubeUserByUserId,
    insertUserTubeUserLink,
} from "../duckdb";
import { generateInviteCode } from "../slack";
import {
    createRoom,
    registerUser,
    setDisplayName,
    setProfilePicture,
    uploadImage,
} from "../matrix/matrixClientRequests";
import { sendMessageAsMatrixUser } from "../matrix/handler";
import { Request, Response, Express } from "express";
import { ChatHackersEvent, TubeRoomLink } from "../types";

const { INVITE_PREFIX } = process.env;

// channel ids look like `${room_id}@${origin}`, matrix room ids don't contain "@" so the first one is the separator
function splitChannelId(channelId: string): [string, string] {
    const index = channelId.indexOf("@");
    return [channelId.slice(0, index), channelId.slice(index + 1)];
}

function getDisplayName(event: ChatHackersEvent) {
    // event.sender looks like @name:homeserver
    return event.sender.split(":")[0].replace("@", "");
}

async function echo(event: ChatHackersEvent, message: string) {
    const channelId = `${event.room_id}@${event.origin}`;
    const newMessage = "you said: " + message.split("!echo ")[1];

    sendChatHackersMessage("Spacetube", newMessage, channelId);
}

async function create(event: ChatHackersEvent, message: string) {
    const channelId = `${event.room_id}@${event.origin}`;
    const createRoomResponse = await createRoom("tube room");
    const createRoomResult = await createRoomResponse.json();
    const tube_room_id = createRoomResult.room_id;

    const optionalInviteText = message;
    const inviteCode = generateInviteCode(optionalInviteText);

    insertChannelTubeRoomLink(channelId, "chathackers", tube_room_id);
    insertInviteTubeRoomLink(inviteCode, tube_room_id);

    sendChatHackersMessage("Spacetube", `Tube is open with invite code: ${inviteCode}`, channelId);
    //add message about what the other group needs to do
}

async function remindInviteCode(existingTube: TubeRoomLink) {
    const existingInviteCode = await getInviteCodeByTubeId(existingTube.tube_room_id);

    if (existingInviteCode) {
        sendChatHackersMessage(
            "Spacetube",
            `Tube already open with invite code: ${existingInviteCode.invite_code}`,
            existingTube.channel_id
        );
    }
    else {
        const inviteCode = generateInviteCode();
        insertInviteTubeRoomLink(inviteCode, existingTube.tube_room_id);

        sendChatHackersMessage(
            "Spacetube",
            `Tube already open with invite code: ${inviteCode}`,
            existingTube.channel_id
        );
    }

}

async function connect(event: ChatHackersEvent, message: string) {
    const channelId = `${event.room_id}@${event.origin}`;
    const invite = await getInviteTubeRoomLink(message);

    if (invite) {
        deleteChannelTubeRoomLinks(channelId);

        insertChannelTubeRoomLink(channelId, "chathackers", invite.tube_room_id as string);
        sendChatHackersMessage("Spacetube", "You have joined the spacetube!", channelId);
        //add message about how to send messages
    } else {
        sendChatHackersMessage("Spacetube", "No tube found for that invite code", channelId);
    }
}

async function forward(event: ChatHackersEvent, message: string) {
    const channelId = `${event.room_id}@${event.origin}`;
    const userId = `${event.sender}@${event.origin}`;
    const link = await getTubeRoomLinkByChannelId(channelId);

    if (!link) return;

    const user = await getTubeUserByUserId(userId);

    if (user) {
        const matrixUser = {
            user_id: user.tube_user_id,
            access_token: user.tube_user_access_token,
        };

        sendMessageAsMatrixUser(matrixUser, message, link.tube_room_id, {
            from: channelId,
        });
    } else {
        const displayName = getDisplayName(event);
        const profilePicUrl = "";
        const matrixUserResponse = await registerUser(displayName);
        const matrixUser = await matrixUserResponse.json();
        setDisplayName(matrixUser, displayName);

        if (profilePicUrl) {
            const avatarUrl = await getMatrixUrlFromChatHackers(profilePicUrl);
            setProfilePicture(matrixUser, avatarUrl);
        }

        sendMessageAsMatrixUser(matrixUser, message, link.tube_room_id, {
            from: channelId,
        });

        insertUserTubeUserLink(userId, matrixUser);
    }
}

async function handleEvent(event: ChatHackersEvent) {
    const channelId = `${event.room_id}@${event.origin}`;

    const existingTube = await getTubeRoomLinkByChannelId(channelId);
    const message = event.content?.body || "";
    const messageNoSpaces = message.replaceAll(" ", "");

    if (!existingTube) {
        if (messageNoSpaces.includes(INVITE_PREFIX as string)) {
            connect(event, messageNoSpaces);
            return;
        } else {
            create(event, messageNoSpaces);
            return;
        }
    } else {
        if (!messageNoSpaces) {
            console.log("existing tube", existingTube)
            remindInviteCode(existingTube as TubeRoomLink);
            return;
        } else {
            if (messageNoSpaces.includes("!echo")) {
                echo(event, message);
                return;
            }

            forward(event, message);
            return;
        }
    }
}

// channelId is `${room_id}@${origin}`, origin being the chat hackers return url
export async function sendChatHackersMessage(name: string, message: string, channelId: string) {
    const [roomId, url] = splitChannelId(channelId);

    fetch(url, {
        method: "POST",
        body: JSON.stringify({
            roomId,
            name,
            message,
        }),
        headers: {
            "Content-type": "application/json",
        },
    });
}

export async function startChatHackers(app: Express) {
    app.post("/chathackers", async function (req: Request, res: Response) {
        const event: ChatHackersEvent = req.body;

        if (event.origin) {
            handleEvent(event);
            res.send({ success: true });
        } else {
            res.send({ success: false, origin: false });
        }
    });
}

async function getMatrixUrlFromChatHackers(chatHackersImageUrl: string) {
    const profilePicResponse = await fetch(chatHackersImageUrl);
    const profilePicBlob = await profilePicResponse.blob();
    const profilePicBufferArray = await profilePicBlob.arrayBuffer();
    const profilePicBuffer = Buffer.from(profilePicBufferArray);
    const imageResponse = await uploadImage("chathackers_profile.jpeg", profilePicBuffer);
    const imageResult = await imageResponse.json();
    return imageResult.content_uri;
}