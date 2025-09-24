import Stars from "./Stars";
import Header from "./Header";

const Rocketchat = () => {
  return (
    <div id="slack-container">
      <Stars />
      <Header />
      <div id="instructions-container">
        <h2>Rocketchat Instructions</h2>
        <p>Spacetube on Rocketchat has a simple set-up with 3 steps:</p>
        <p>1. Install the spacetube private app</p>
        <p>
          2. Create or connect to a tube by sending <span>/spacetube</span> or{" "}
          <span>/spacetube invite-code-here</span>
        </p>
        <p>
          3. Start sending messages by sending{" "}
          <span>/spacetube your-message-here</span>
        </p>
        <p>Read on for the Rocketchat Specifics...</p>
        <span className="divider"></span>
        <h3 className="center">Install the Spacetube private app</h3>
        <p>
          1. Download the plugin here, or build it yourself by following the
          instructions on github
        </p>
        <p>
          2. On Rocketchat go to Administration → Marketplace → Private Apps,
          click "Upload private app", browse file for the plugin you just
          downloaded/built. Click Agree.
        </p>
        <p>
          3. Register your chat server with Spacetube. On the App Info page,
          under APIs, copy the url in the curl POST request, and then in the
          general channel send /spacetube followed by the url you just copied,
          like this:{" "}
          <span>
            /spacetube
            https://chat.example.com/api/apps/public/c16853cf-c591-4453-b1dd-7def3e08cf02/forward
          </span>
        </p>
        <p className="center">Once that's done, EITHER:</p>
        <h3 className="center">Connect to an existing tube</h3>
        <p>1. Copy the invite code you received from someone else.</p>
        <p>
          2. Send /spacetube followed by the invite code you received to the
          room. It should look like <span>/spacetube invite-code-here</span>
        </p>
        <p className="center">OR</p>
        <h3 className="center">Create a new tube</h3>
        <p>
          1. Send <span>/spacetube</span> in a channel to make a new tube!
          Spacetube will make a new invite code for you. You can customise your
          invite code by sending <span>/spacetube custom-invite-code-here</span>{" "}
          instead when you make the tube.
        </p>
        <p>
          2. Share the invite code with someone in the group you want to connect
          to. Now they need to do the next part.
        </p>
        <p className="center">FINALLY</p>
        <h3 className="center">Send messages</h3>
        <p>
          Send messages by sending <span>/spacetube what's up earthlings?</span>{" "}
          in the room and everything after /spacetube will be forwarded to those
          in the tube.
        </p>
        <h2>Happy tubing!</h2>
      </div>
    </div>
  );
};

export default Rocketchat;
