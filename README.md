# 🛸Spacetube🛸

Welcome to Spacetube!

Spacetube is a way to connect chat groups together, so that they can communicate with each other as their group identities.

You can use the default hosted instance running on spacetu.be or set-up your own. Here are the instructions on how to do that.

## Use The Spacetu.be Instance

There's a default instance hosted on spacetu.be that you can use.

### Through Your Matrix Client

1. Invite `@spacetube_bot:spacetu.be` to the room you want to open the tube in (for now the room CAN'T be end to end encrypted)
2. Send `!spacetube create` in the room
3. Copy the connection code and send to a contact in the group you want to connect to
4. Have your contact in the other group send `!spacetube connect <the-connection-code>`
5. The tube is open, get talking

### Through The Web

1. Open a room that you have previously set up with spacetube with your matrix client
2. Send `!spacetube link` in the room you use spacetube in
3. Spacetube will give you a link with a link token and name in it. The link token is tied to your original matrix room and basically grants access to it. The name will be your display name on the web view of spacetube.
4. Follow the link. Once it loads, you can now send message to the original room using the textbox and button at the bottom
5. To forward a message to the spacetube, click on a message and confirm

You are using the web version of spacetube!

### Through Discord

1. Add the Spacetube bot to your server, using this link: https://discord.com/oauth2/authorize?client_id=1024778983021215764&permissions=603982848&response_type=code&redirect_uri=https%3A%2F%2Fspacetube.spacetu.be&scope=messages.read+bot
2. Add Space Tube bot to the channel you want to open the tube in
3. use the /create command to make a new tube opening
4. Copy the connection code Space Tube Bot sent you and share with your contact in the other group
5. Have your contact use the /connect command, entering the connection code you shared
6. Use /send to send messages to the other group

#### Experimental Web Feature

You can also use the web interface through discord by using `/send !spacetube link`. You will probably want to edit the link, because at the moment, the name comes back as a long string that isn't very friendly. Change the name part in the url, it looks like this: https://spacetube.spacetu.be/?linkToken=cRaZyNuMb3R5aNdLeTtErs&name=yourdesiredname

Change yourdesiredname to the chat nickname you want, and then follow the link.

## Self-Hosting Instructions

You can host space tube yourself! It's an app service on matrix, so you'll need a home server, and to connect your instance to other platforms requires some specific things for each one.

You will need:

-   a matrix homeserver. The recommended way to have one is using matrix-ansible-docker
    on that server you need:
-   git `git --version`
-   npm `node --version` recommend later version of node, 18.12.0 works

1. create your homeserver. this service assumes you have a domain, matrix.example.com that you run matrix on. This is how [matrix-docker-ansible-deploy](https://github.com/spantaleev/matrix-docker-ansible-deploy) gets you to set it up. If you're new to matrix, matrix-docker-ansible-deploy is a straightforward way to start. Note: you need the federation turned on if you want spacetube to work across different homeservers.
2. `git clone https://github.com/King-Mob/spacetube-app-service.git` the appservice to your server. `cd space-tube-app-service` to open the directory
3. `npm install` the app service
4. `cp .env.example .env` creates a .env file by copying the example env into the project folder. Make sure HOST is set to either host.docker.internal or localhost and HOME_SERVER set to the domain you're running matrix on, e.g. example.com
5. `npm run register` to create your registration file. This creates `registration.yaml` in the project folder.
6. Copy the `hs_token` and `as_token` from `registration.yaml` and paste into your `.env` file as `HOME_SERVER_TOKEN` and `APPLICATION_TOKEN` respectively.
7. Add the path to the registration config file to your homeserver. For matrix-ansible-docker that means adding these variables to your vars.yml. The first variable sets up a link between the docker container and the project folder using a variable called `src` that references the absolute path of the project. Change the `src` if it's different from your project setup.

```
matrix_synapse_container_extra_arguments: ['--add-host host.docker.internal:host-gateway --mount type=bind,src=/root/space-tube-app-service,dst=/appservice-spacetube']
matrix_synapse_app_service_config_files: ['/appservice-spacetube/registration.yaml']
```

For a normal synapse instance add the path to `registration.yaml` to the [server config file](https://matrix-org.github.io/synapse/latest/application_services.html), which should be in `configs/homeserver.yaml` within synapse. This references the absolute path of the registration file, so change it if the following isn't correct:
`app_service_config_files: - /root/space-tube-app-service/registration.yaml`

8. Set-up and restart your homeserver.
9. Build the app service using `npm run build-server`.
10. Create the management room using `npm run setup`. Copy the room id e.g. `!someletters:domain.com`
11. Paste the room id in the `.env` file under MANAGEMENT_ROOM_ID.
12. Start the app service using `npm run build`. To have it run indefinitely, you'll need a process runner like systemd or pm2. [SystemD](https://nodesource.com/blog/running-your-node-js-app-with-systemd-part-1/) is a standard linux way to run processes. [PM2](https://www.digitalocean.com/community/tutorials/how-to-use-pm2-to-setup-a-node-js-production-environment-on-an-ubuntu-vps) is an easy to use node solution.

13. Start talking to space tube
    invite `@spacetube_bot:<your domain>` to your chat e.g. @spacetube_bot:example.com
    `!spacetube echo <some test text>`

You can interact with it in the same way as the default spacetube instance, and connect to others on different instances.

### Discord Set-up

The discord connection uses a bot created through discord's interface here: https://discord.com/developers/applications

Create a discord application, and a bot.

Copy the public key, the app id, and the discord token into your .env file, like so:

```
DISCORD_PUBLIC_KEY=something
DISCORD_APP_ID=something
DISCORD_TOKEN=something
```

run `npm run register-discord`

You need an https connection to port 8134 on the server you're running the app service on.

Currently I'm using ngrok.

`install ngrok`

`ngrox http 8134`

You should get a message that contains this:
`https://<string-of-letters-and-numbers>.ngrok-free.app/`

Copy that url, add `/interactions` to the end and paste this into the bot interactions url field on the [discord applications interface](https://discord.com/developers/applications) like so:

`https://<string-of-letters-and-numbers>.ngrok-free.app/interactions`

Click the save button and if it disappears, you are good to go!

## Feedback

Please join me in #spacetube-public:spacetu.be on matrix if you have any feedback or questions at all about the project.

Life is more spacious in tubes!

## Acknowledgements

This project was funded through the NGI0 Entrust Fund, a fund established by NLnet with financial support from the European Commission's Next Generation Internet programme, under the aegis of DG Communications Networks, Content and Technology under grant agreement No 101069594.

![nlnet logo](https://nlnet.nl/logo/banner.png)
![NG10 logo](https://nlnet.nl/image/logos/NGI0Entrust_tag.svg)
