import {
    getRocketchatUrlIpLinkByIp,
    insertRocketchatUrlIpLink,
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

const { INVITE_PREFIX, HOME_SERVER } = process.env;

async function echo(event, url) {
    const message = event.params.join(" ");
    const newMessage = "you said: " + message.split("!echo ")[1];

    sendRocketchatMessage(event.room.id, newMessage, url);
}

async function create(event, message, url) {
    const channelId = `${event.room.id}@${url}`;
    const createRoomResponse = await createRoom("tube room");
    const createRoomResult = await createRoomResponse.json();
    const tube_room_id = createRoomResult.room_id;

    const optionalInviteText = message;
    const inviteCode = generateInviteCode(optionalInviteText);

    insertChannelTubeRoomLink(channelId, "rocketchat", tube_room_id);
    insertInviteTubeRoomLink(inviteCode, tube_room_id);

    sendRocketchatMessage(event.room.id, `Tube is open with invite code: ${inviteCode}`, url);
    //add message about what the other group needs to do
}

async function remindInviteCode(existingTube, url) {
    const existingInviteCode = await getInviteCodeByTubeId(existingTube.tube_room_id);

    sendRocketchatMessage(
        existingTube.channel_id.split("@")[0],
        `Tube already open with invite code: ${existingInviteCode.invite_code}`,
        url
    );
}

async function connect(event, message, url) {
    const channelId = `${event.room.id}@${url}`;
    const invite = await getInviteTubeRoomLink(message);

    if (invite) {
        deleteChannelTubeRoomLinks(channelId);

        insertChannelTubeRoomLink(channelId, "rocketchat", invite.tube_room_id as string);
        sendRocketchatMessage(event.room.id, "You have joined the spacetube!", url);
        //add message about how to send messages
    } else {
        sendRocketchatMessage(event.room.id, "No tube found for that invite code", url);
    }
}

async function forward(event, message, url) {
    const channelId = `${event.room.id}@${url}`;
    const userId = `${event.sender.id}@${url}`;
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
        const displayName = event.sender.name;
        const profilePicUrl = "";
        const matrixUserResponse = await registerUser(displayName);
        const matrixUser = await matrixUserResponse.json();
        setDisplayName(matrixUser, displayName);

        if (profilePicUrl) {
            const avatarUrl = await getMatrixUrlFromRocketchat(profilePicUrl);
            setProfilePicture(matrixUser, avatarUrl);
        }

        sendMessageAsMatrixUser(matrixUser, message, link.tube_room_id, {
            from: channelId,
        });

        insertUserTubeUserLink(userId, matrixUser);
    }
}

async function handleEvent(event, url) {
    const channelId = `${event.room.id}@${url}`;

    const existingTube = await getTubeRoomLinkByChannelId(channelId);
    const message = event.params.join(" ");
    const messageNoSpaces = message.replaceAll(" ", "");

    if (!existingTube) {
        if (messageNoSpaces.includes(INVITE_PREFIX)) {
            connect(event, messageNoSpaces, url);
            return;
        } else {
            create(event, messageNoSpaces, url);
            return;
        }
    } else {
        if (!messageNoSpaces) {
            remindInviteCode(existingTube, url);
            return;
        } else {
            if (messageNoSpaces.includes("!echo")) {
                echo(event, url);
                return;
            }

            forward(event, message, url);
            return;
        }
    }
}

const defaultImageUrl = `https://spacetube.${HOME_SERVER}/image/?mxc=spacetu.be/PSBLUsPIprWrFYTOPXqqIXaY`;
export async function sendRocketchatMessage(roomId, text, url, alias = "Spacetube", imageUrl = defaultImageUrl) {
    fetch(url, {
        method: "POST",
        body: JSON.stringify({
            roomId,
            text,
            alias,
            imageUrl,
        }),
        headers: {
            "Content-type": "application/json",
            Authorization: "Bearer whatever-some-token",
        },
    });
}

export async function startRocketchat(app) {
    app.post("/rocketchat/event", async function (req, res) {
        const event = req.body;
        const serverIP = req.headers["x-real-ip"];

        const urlIpLinks = await getRocketchatUrlIpLinkByIp(serverIP);
        const urlIpLink = urlIpLinks[0];

        if (urlIpLink) {
            handleEvent(event, urlIpLink.url);
            res.send({ success: true });
        } else {
            res.send({ success: false, registration: false });
        }
    });

    app.post("/rocketchat/register", async function (req, res) {
        const { url } = req.body;
        const serverIP = req.headers["x-real-ip"];

        console.log(url, serverIP);

        insertRocketchatUrlIpLink(url, serverIP);

        res.send({ success: true });
    });
}

async function getMatrixUrlFromRocketchat(rocketchatImageUrl: string) {
    const profilePicResponse = await fetch(rocketchatImageUrl);
    const profilePicBlob = await profilePicResponse.blob();
    const profilePicBufferArray = await profilePicBlob.arrayBuffer();
    const profilePicBuffer = Buffer.from(profilePicBufferArray);
    const imageResponse = await uploadImage("slack_profile.jpeg", profilePicBuffer);
    const imageResult = await imageResponse.json();
    return imageResult.content_uri;
}
