import { MediaStream, type MediaStream as MediaStreamType } from "react-native-webrtc";

import { P2pScreenShare } from "./p2p-screen-share";

/**
 * A standalone screen-sharing P2P session. Only the caller captures display
 * media. The recipient supplies no local media and receives the screen track.
 */
export class P2pScreenCall {
  private readonly screenShare = new P2pScreenShare();
  private stream: MediaStreamType | null = null;

  async start({ isCaller }: { isCaller: boolean }) {
    await this.stop();
    this.stream = isCaller ? await this.screenShare.start() : new MediaStream();
    return this.stream;
  }

  getStream() {
    return this.stream;
  }

  async stop() {
    await this.screenShare.stop();
    this.stream = null;
  }
}
