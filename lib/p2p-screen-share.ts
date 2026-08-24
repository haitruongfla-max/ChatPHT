import { mediaDevices, type MediaStream, type RTCPeerConnection } from "react-native-webrtc";

import type { P2pSignal } from "@/lib/p2p-call";

type ScreenShareContext = {
  peer: RTCPeerConnection;
  isConnected: () => boolean;
  onSignal: (signal: P2pSignal) => Promise<void> | void;
  renegotiate: () => Promise<void>;
};

/** Owns Android MediaProjection only. It never captures microphone or camera media. */
export class P2pScreenShare {
  private stream: MediaStream | null = null;
  private senders: Array<ReturnType<RTCPeerConnection["addTrack"]>> = [];

  isActive() {
    return Boolean(this.stream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  async start(context: ScreenShareContext) {
    if (!context.isConnected()) throw new Error("Hãy đợi cuộc gọi P2P kết nối rồi mới chia sẻ màn hình.");
    if (this.stream) return this.stream;

    const getDisplayMedia = (mediaDevices as typeof mediaDevices & {
      getDisplayMedia?: (constraints: { video: boolean; audio: boolean }) => Promise<MediaStream>;
    }).getDisplayMedia;
    if (!getDisplayMedia) throw new Error("Thiết bị không hỗ trợ MediaProjection để chia sẻ màn hình.");

    const stream = await getDisplayMedia({ video: true, audio: false });
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Android chưa cấp track màn hình. Hãy chấp nhận hộp thoại ghi màn hình rồi thử lại.");
    }

    this.stream = stream;
    this.senders = tracks.map((track) => context.peer.addTrack(track, stream));
    tracks.forEach((track) => {
      track.onended = () => { void this.stop(context); };
    });

    try {
      await context.onSignal({ type: "screen-start", payload: JSON.stringify({ trackId: tracks[0].id }) });
      await context.renegotiate();
      return stream;
    } catch (error) {
      await this.stop(context);
      throw error;
    }
  }

  async stop(context: ScreenShareContext) {
    const stream = this.stream;
    if (!stream) return;
    this.stream = null;
    const trackId = stream.getVideoTracks()[0]?.id ?? "";
    try {
      await context.onSignal({ type: "screen-stop", payload: JSON.stringify({ trackId }) });
    } catch {
      // Local MediaProjection cleanup must survive a signaling outage.
    }
    this.removeTracks(context.peer);
    stream.getTracks().forEach((track) => track.stop());
    if (context.isConnected()) await context.renegotiate();
  }

  async dispose(peer: RTCPeerConnection | null) {
    const stream = this.stream;
    this.stream = null;
    if (peer) this.removeTracks(peer);
    else this.senders = [];
    stream?.getTracks().forEach((track) => track.stop());
  }

  private removeTracks(peer: RTCPeerConnection) {
    this.senders.forEach((sender) => {
      try { peer.removeTrack(sender); } catch { /* peer already closed */ }
    });
    this.senders = [];
  }
}
