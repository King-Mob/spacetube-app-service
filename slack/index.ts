import {
    insertUserTubeUserLink,
    getTubeRoomLinkByChannelId,
    getInviteCodeByTubeId,
    insertChannelTubeRoomLink,
    insertChannelTeamLink,
    insertInviteTubeRoomLink,
    deleteChannelTubeRoomLinks,
    deleteChannelTeamLinks,
    getInviteTubeRoomLink,
    getTubeUserByUserId,
    insertTeamBotTokenLink,
    getChannelTeamLink,
    getTeamBotTokenLink,
} from "../duckdb";
import xkpasswd from "xkpasswd";
import {
    registerUser,
    setDisplayName,
    createRoom,
    getImage,
    setProfilePicture,
    uploadImage,
} from "../matrix/matrixClientRequests";
import { sendMessageAsMatrixUser } from "../matrix/handler";
import { Request, Response, Express } from "express";
import { v4 as uuidv4 } from "uuid";
import sha1 from "sha1";
import { SlackEvent, TubeRoomLink } from "../types";

const { SLACK_SECRET, SLACK_CLIENT_ID, HOME_SERVER, INVITE_PREFIX } = process.env;

export function generateInviteCode(optionalInviteText: string) {
    const textPortion = optionalInviteText || xkpasswd({ separators: "" });

    const cleanTextPortion = textPortion.replaceAll("~", "").replaceAll("CoCoDoJo_", "");

    const hashPortion = sha1(uuidv4()).slice(0, 8);

    return `CoCoDoJo_${cleanTextPortion}_${hashPortion}~${(HOME_SERVER as string).replaceAll(".", "\\")}`;
}

async function echo(event: SlackEvent) {
    await deleteChannelTeamLinks(event.channel);
    await insertChannelTeamLink(event.channel, event.team);

    const message = event.text;
    const newMessage = "you said: " + message.split("!echo ")[1];

    sendSlackMessage(event.channel, newMessage, "spacetube");
}

async function create(event: SlackEvent, message: string) {
    const createRoomResponse = await createRoom("tube room");
    const createRoomResult = await createRoomResponse.json();
    const tube_room_id = createRoomResult.room_id;

    const optionalInviteText = message;
    const inviteCode = generateInviteCode(optionalInviteText);

    insertChannelTubeRoomLink(event.channel, "slack", tube_room_id);
    insertInviteTubeRoomLink(inviteCode, tube_room_id);

    await insertChannelTeamLink(event.channel, event.team);
    sendSlackMessage(event.channel, `Tube is open with invite code: ${inviteCode}`, "spacetube");
    //add message about what the other group needs to do
}

async function remindInviteCode(existingTube: TubeRoomLink) {
    const existingInviteCode = await getInviteCodeByTubeId(existingTube.tube_room_id);

    sendSlackMessage(
        existingTube.channel_id,
        `Tube already open with invite code: ${existingInviteCode.invite_code}`,
        "spacetube"
    );
}

async function connect(event: SlackEvent, message: string) {
    await deleteChannelTeamLinks(event.channel);
    await insertChannelTeamLink(event.channel, event.team);

    const invite = await getInviteTubeRoomLink(message);

    if (invite) {
        deleteChannelTubeRoomLinks(event.channel);

        insertChannelTubeRoomLink(event.channel, "slack", invite.tube_room_id as string);
        sendSlackMessage(event.channel, "You have joined the spacetube!", "spacetube");
        //add message about how to send messages
    } else {
        sendSlackMessage(event.channel, "No tube found for that invite code", "spacetube");
    }
}

async function forward(event: SlackEvent, message: string) {
    const link = await getTubeRoomLinkByChannelId(event.channel);

    if (!link) return;

    const user = await getTubeUserByUserId(event.user);

    if (user) {
        const matrixUser = {
            user_id: user.tube_user_id,
            access_token: user.tube_user_access_token,
        };

        sendMessageAsMatrixUser(matrixUser, message, link.tube_room_id, {
            from: event.channel,
        });
    } else {
        const { displayName, profilePicUrl } = await getSlackProfile(event.channel, event.user);
        const matrixUserResponse = await registerUser(displayName);
        const matrixUser = await matrixUserResponse.json();
        setDisplayName(matrixUser, displayName);

        if (profilePicUrl) {
            const avatarUrl = await getMatrixUrlFromSlack(profilePicUrl);
            setProfilePicture(matrixUser, avatarUrl);
        }

        sendMessageAsMatrixUser(matrixUser, message, link.tube_room_id, {
            from: event.channel,
        });

        insertUserTubeUserLink(event.user, matrixUser);
    }
}

async function handleMention(event: SlackEvent) {
    const existingTube = await getTubeRoomLinkByChannelId(event.channel);
    const { bot_user_id } = await getBotFromTeam(event.team);
    const message = event.text.replace(`<@${bot_user_id}>`, "");
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
            remindInviteCode(existingTube as TubeRoomLink);
            return;
        } else {
            if (messageNoSpaces.includes("!echo")) {
                echo(event);
                return;
            }

            forward(event, message);
            return;
        }
    }
}

const previousEvents: any[] = [];

export async function startSlack(app: Express) {
    app.post("/slack/events", async function (req: Request, res: Response) {
        const { challenge, event } = req.body;

        // slack sends events twice, we only want to handle the first one
        if (previousEvents.find((previousEvent) => previousEvent.event_ts === event.event_ts)) {
            return;
        } else {
            previousEvents.push(event);
        }

        if (challenge) return res.send(challenge);

        if (event.type === "app_mention") {
            console.log("slack event", event);
            handleMention(event);
        }
    });

    app.get("/api/slack/process/", async function (req: Request, res: Response) {
        const { slackCode } = req.query;

        const data = new URLSearchParams();
        data.append("code", slackCode as string);
        data.append("client_id", SLACK_CLIENT_ID as string);
        data.append("client_secret", SLACK_SECRET as string);

        const slackResponse = await fetch("https://slack.com/api/oauth.v2.access", {
            method: "POST",
            body: data,
        });
        const slackResult = await slackResponse.json();

        if (slackResult.ok) {
            const {
                access_token,
                team: { id },
                bot_user_id,
            } = slackResult;

            insertTeamBotTokenLink(id, access_token, bot_user_id);

            return res.send({ success: true });
        }

        return res.send({ success: false });
    });
}

async function getBotFromChannel(channelId: string) {
    const { team_id } = await getChannelTeamLink(channelId);
    return await getBotFromTeam(team_id as string);
}

async function getBotFromTeam(teamId: string) {
    const { bot_token, bot_user_id } = await getTeamBotTokenLink(teamId);

    return { bot_token, bot_user_id, team_id: teamId };
}

export async function sendSlackMessage(channel: string, text: string, username: string, icon_url: string = "") {
    const { bot_token } = await getBotFromChannel(channel);

    return fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        body: JSON.stringify({
            channel,
            text,
            username,
            icon_url,
        }),
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bot_token}`,
        },
    });
}

async function getSlackProfile(channelId: string, userId: string) {
    const { bot_token, team_id } = await getBotFromChannel(channelId);

    const slackUserResponse = await fetch(`https://slack.com/api/users.profile.get?user=${userId}`, {
        headers: {
            Authorization: `Bearer ${bot_token}`,
        },
    });
    const slackUser = await slackUserResponse.json();
    const userName = slackUser.profile.display_name || slackUser.profile.first_name + " " + slackUser.profile.last_name;

    const slackTeamResponse = await fetch(`https://slack.com/api/team.info?team=${team_id}`, {
        headers: {
            Authorization: `Bearer ${bot_token}`,
        },
    });
    const { team } = await slackTeamResponse.json();

    return {
        displayName: `${userName}.${team.name}`,
        profilePicUrl: slackUser.profile.image_original ? slackUser.profile.image_original.replaceAll("\\", "") : null,
    };
}

async function getMatrixUrlFromSlack(slackImageUrl: string) {
    const profilePicResponse = await fetch(slackImageUrl);
    const profilePicBlob = await profilePicResponse.blob();
    const profilePicBufferArray = await profilePicBlob.arrayBuffer();
    const profilePicBuffer = Buffer.from(profilePicBufferArray);
    const imageResponse = await uploadImage("slack_profile.jpeg", profilePicBuffer);
    const imageResult = await imageResponse.json();
    return imageResult.content_uri;
}
