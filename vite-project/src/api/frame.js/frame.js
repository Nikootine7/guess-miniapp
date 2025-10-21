import { createFrameHandler } from "@airstack/farcaster-frame";

export const POST = createFrameHandler({
  async onFrameRequest(req) {
    const { action, state, user } = req;

    if (action === "GUESS") {
      return {
        image: "https://YOURDOMAIN.com/guess-image.png",
        buttons: [
          { text: "Submit Guess", action: "link", target: "https://YOURDOMAIN.com/play" }
        ],
        postUrl: "https://YOURDOMAIN.com/api/frame"
      };
    }

    return {
      image: "https://YOURDOMAIN.com/start-image.png",
      buttons: [
        { text: "Play Now", action: "post", target: "GUESS" }
      ]
    };
  }
});