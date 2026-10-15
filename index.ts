import "dotenv/config";
import express, { Express } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { AppService, AppserviceHttpError } from "matrix-appservice";
import { user } from "./types.js";
import {
    registerUser,
    setDisplayName,
    sync,
    uploadImage,
    setProfilePicture,
    getProfile,
    getImage,
    getDisplayNames,
    sendMessage,
} from "./matrix/matrixClientRequests.js";
import {
    inviteAsUser,
    handleMessage,
    handleInvite,
    handleRemoteOpen,
    createGroupUser,
    createInvitationRoom,
    createInvitationReceivedRoom,
    linkAsSpacetube,
} from "./matrix/handler.js";
import commands from "./matrix/commands.js";
import { getItem, getItemIncludes, getAllItems, storeItem } from "./matrix/storage.js";
import { startDuckDB } from "./duckdb.js";
import { startDiscord } from "./discord/index.js";
import { startSlack } from "./slack/index.js";
import { startRocketchat } from "./rocketchat/index.js";
import { startChatHackers } from "./chathackers/index.js";

//import { startWhatsapp } from "./whatsapp/index.js";

// listening
const as = new AppService({
    homeserverToken: process.env.HOME_SERVER_TOKEN,
});
startDuckDB();

as.on("http-log", (event) => {
    console.log("http-log", event);
});

as.on("event", (event) => {
    //console.log("event received", event);

    switch (event.type) {
        case "m.room.message":
            handleMessage(event);
            break;
        case "m.room.member":
            handleInvite(event);
            break;
        case "spacetube.remote.open":
            handleRemoteOpen(event);
            break;
        case "spacetube.forward":
            commands.forward(event, event.content);
            break;
    }
});

as.on("ephemeral", (event) => {
    console.log(event);
});

// can also do this as a promise
as.onAliasQuery = async function (alias) {
    console.log("RECV %s", alias);
};

//handle ping
const asApp = as.expressApp;
asApp.post("/_matrix/app/v1/ping", (req, res) => {
    console.log(req);
    res.send({ message: "yo how's it going on 8133!" });
});

console.log("spacetube is listening on 8133");
asApp.listen(8133);

//spacetube service on 8134

const app: Express = express();
const upload = multer({ dest: "uploads/" });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("dist-web"));
app.use("/slack", express.static("dist-web"));
app.use("/matrix", express.static("dist-web"));
app.use("/rocketchat", express.static("dist-web"));

app.get("/image", async function (req, res) {
    const { mxc } = req.query;

    const imageResponse = await getImage(mxc);

    const imageBlob: Blob = await imageResponse.blob();
    const imageBufferArray = await imageBlob.arrayBuffer();
    const imageBuffer = Buffer.from(imageBufferArray);

    res.set("Content-Type", imageResponse.headers["Content-Type"]);
    return res.send(imageBuffer);
});

app.post("/api/register", async (req, res) => {
    const linkEvent = await getItem("linkToken", req.body.linkToken, "spacetube.link");
    if (linkEvent) {
        const userRegistration = await registerUser(req.body.userName);
        const user = (await userRegistration.json()) as user;

        await setDisplayName(user, req.body.userName);

        const matrixRoomId = linkEvent.content.roomId;
        const inviteUser = await getItem("roomId", matrixRoomId, "spacetube.group.invite");

        if (inviteUser) {
            const groupUser = await getItem("userId", inviteUser.content.originalUserId, "spacetube.group.user");
            await inviteAsUser(groupUser.content.user, user, linkEvent.content.roomId);

            res.send({
                success: true,
                ...user,
            });
        }
    } else {
        console.log("no invite user found");
        res.send({
            success: false,
            message: "No room active with that link token",
        });
    }
});

app.get("/api/tubeInfo", async (req, res) => {
    const linkEvent = await getItem("linkToken", req.query.linkToken, "spacetube.link");
    if (linkEvent) {
        const tube = await getItemIncludes("connectedRooms", linkEvent.content.roomId);

        const { tubeIntermediary } = tube.content;

        const response = await fetch(
            `https://matrix.${process.env.HOME_SERVER}/_matrix/client/v3/rooms/${tubeIntermediary}/messages?limit=1000`,
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.APPLICATION_TOKEN}`,
                },
            }
        );
        const eventsList = await response.json();

        res.send({
            success: true,
            matrixRoomId: linkEvent.content.roomId,
            tubeRoomEvents: eventsList.chunk,
        });
    } else {
        res.send({
            success: false,
            message: "No room active with that link token",
        });
    }
});

app.get("/api/tubeInfo/sync", async (req, res) => {
    const { linkToken, nextBatch } = req.query;

    const linkEvent = await getItem("linkToken", linkToken, "spacetube.link");

    if (linkEvent) {
        const matrixRoomId = linkEvent.content.roomId;

        const inviteUser = await getItem("roomId", matrixRoomId, "spacetube.group.invite");

        const groupUser = await getItem("userId", inviteUser.content.originalUserId, "spacetube.group.user");

        const syncData = (await sync(groupUser.content.user, nextBatch)) as object;

        res.send({
            success: true,
            ...syncData,
            matrixRoomId,
        });
    } else {
        res.send({
            success: false,
            message: "No room active with that link token",
        });
    }
});

app.get("/api/tubeInfo/userIds", async (req, res) => {
    const { linkToken } = req.query;

    const linkEvent = await getItem("linkToken", linkToken, "spacetube.link");

    if (linkEvent) {
        const matrixRoomId = linkEvent.content.roomId;

        const cloneUsers = await getAllItems("roomId", matrixRoomId, "spacetube.group.clone");
        console.log("cloneusers", cloneUsers);
        const cloneIds = cloneUsers.map((cloneUser) => cloneUser.content.userId);

        const inviteUser = await getItem("roomId", matrixRoomId, "spacetube.group.invite");
        console.log("inviteuser later", inviteUser);
        const groupUser = await getItem("userId", inviteUser.content.originalUserId, "spacetube.group.user");

        res.send({
            success: true,
            tubeUserIds: [groupUser.content.userId, ...cloneIds],
        });
    } else {
        res.send({
            success: false,
            message: "No room active with that link token",
        });
    }
});

app.get("/api/tubeInfo/displaynames", async (req, res) => {
    const { linkToken } = req.query;

    const linkEvent = await getItem("linkToken", linkToken, "spacetube.link");

    if (linkEvent) {
        const tube = await getItemIncludes("connectedRooms", linkEvent.content.roomId);
        if (tube) {
            const { tubeIntermediary } = tube.content;

            const displayNames = await getDisplayNames(tubeIntermediary);

            res.send({
                success: true,
                displayNames,
            });
        }
    } else {
        res.send({
            success: false,
            displayNames: ["false", "fail"],
            message: "No room active with that link token",
        });
    }
});

app.get("/api/tubeInfo/editToken", async (req, res) => {
    const { linkToken } = req.query;

    const linkEvent = await getItem("linkToken", linkToken, "spacetube.link");

    if (linkEvent) {
        const matrixRoomId = linkEvent.content.roomId;
        const inviteUser = await getItem("roomId", matrixRoomId, "spacetube.group.invite");
        const groupUser = await getItem("userId", inviteUser.content.originalUserId, "spacetube.group.user");

        res.send({
            success: true,
            editToken: groupUser.content.editToken,
        });
    } else {
        res.send({
            success: false,
            message: "No room active with that link token",
        });
    }
});

app.get("/api/invite", async (req, res) => {
    const { inviteUserId } = req.query;

    const invitation = await getItem("inviteUserId", inviteUserId);

    if (invitation) res.send({ success: true, invitation });
    else res.send({ success: false, message: "No invite with that id found." });
});

app.post("/api/invite/create", async (req, res) => {
    const { name, groupUserId, groupName } = req.body;

    const { inviteUser, roomId } = await createInvitationRoom(groupUserId, groupName);
    console.log(roomId);
    const { linkToken } = await linkAsSpacetube(roomId, name);

    storeItem({
        type: "spacetube.create.invite",
        from: {
            name,
            groupUserId,
        },
        inviteUserId: inviteUser.user_id,
    });

    const { URL } = process.env;

    res.send({
        success: true,
        inviteLink: `${URL}/?invite=${inviteUser.user_id}`,
        linkToken,
    });
});

app.post("/api/invite/accept", async (req, res) => {
    const { myName, groupName, inviteUserId } = req.body;

    const invitation = await getItem("inviteUserId", inviteUserId);

    if (invitation) {
        const toRoom = await createInvitationReceivedRoom(groupName, invitation.content.inviteUserId);

        const { linkToken } = await linkAsSpacetube(toRoom.room_id, myName);
        res.send({ success: true, invitation, linkToken });
    } else {
        res.send({ success: false, message: "No invite with that id found." });
    }
});

app.post("/api/groupuser", async (req, res) => {
    const { groupName } = req.body;

    const groupUser = await createGroupUser(groupName);

    res.send({
        success: true,
        groupId: groupUser.user_id,
    });
});

app.get("/api/groupuser/name", async (req, res) => {
    const { token } = req.query;

    const groupUser = await getItem("editToken", token, "spacetube.group.user");

    if (groupUser) {
        const profileResponse = await getProfile(groupUser.content.userId);
        const profile = await profileResponse.json();

        res.send({ name: profile.displayname });
    } else {
        res.send({ success: false, message: "No user with matching edit token" });
    }
});

app.get("/api/groupuser/picture", async (req, res) => {
    const { token } = req.query;

    const groupUser = await getItem("editToken", token, "spacetube.group.user");

    if (groupUser) {
        const profileResponse = await getProfile(groupUser.content.userId);
        const profile = await profileResponse.json();

        if (profile.avatar_url) {
            const mxc = profile.avatar_url.split("mxc://")[1];

            const imageResponse = await getImage(mxc);
            const image = await imageResponse.blob();

            res.type(image.type);
            image.arrayBuffer().then((buf) => {
                res.send(Buffer.from(buf));
            });
        } else {
            res.sendStatus("404");
        }
    } else {
        res.send({ success: false, message: "No user with matching edit token" });
    }
});

const imageUpload = upload.fields([
    { name: "displayName", maxCount: 1 },
    { name: "profilePicture", maxCount: 1 },
]);
app.put("/api/groupuser", imageUpload, async (req, res) => {
    const { token } = req.query;

    const groupUser = await getItem("editToken", token, "spacetube.group.user");

    if (groupUser) {
        const inviteUsers = await getAllItems(
            "originalUserId",
            groupUser.content.user.user_id,
            "spacetube.group.invite"
        );
        const cloneUsers = await getAllItems("originalUserId", groupUser.content.user.user_id, "spacetube.group.clone");

        if (req.files) {
            if (req.files.profilePicture) {
                const profilePicture = req.files.profilePicture[0];
                const { filename, originalname } = profilePicture;
                const filePath = path.resolve(`./uploads/${filename}`);

                fs.readFile(filePath, async (err, data) => {
                    const imageResponse = await uploadImage(originalname, data);
                    const { content_uri } = await imageResponse.json();

                    setProfilePicture(groupUser.content.user, content_uri);
                    inviteUsers.forEach((inviteUser) => {
                        setProfilePicture(inviteUser.content.user, content_uri);
                    });
                    cloneUsers.forEach((cloneUser) => {
                        setProfilePicture(cloneUser.content.user, content_uri);
                    });

                    fs.unlink(filePath, () => { });
                });
            }
            if (req.body.displayName) {
                const displayName = req.body.displayName;

                setDisplayName(groupUser.content.user, displayName);
                inviteUsers.forEach((inviteUser) => {
                    setDisplayName(inviteUser.content.user, `${displayName} (invite)`);
                });
                cloneUsers.forEach((cloneUser) => {
                    setDisplayName(cloneUser.content.user, displayName);
                });
            }

            res.send({ success: true });
        }
    } else {
        res.send({ success: false, message: "No user with matching edit token" });
    }
});

app.post("/api/mailinglist", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const { address } = req.query;
    const { MAILINGLIST_ROOM_ID } = process.env;

    sendMessage(MAILINGLIST_ROOM_ID, address);

    res.send({ success: true });
});

if (process.env.DISCORD_TOKEN) {
    startDiscord(app);
}
if (process.env.WHATSAPP_USER_ID) {
    //startWhatsapp();
}
if (process.env.SLACK_SECRET) {
    startSlack(app);
}

startRocketchat(app);
startChatHackers(app);

app.listen(8134);
