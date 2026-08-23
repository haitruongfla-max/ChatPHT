import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStreamTrack,
} from "@livekit/react-native-webrtc";

export type P2pSignalType = "offer" | "answer" | "ice";
export type P2pSignal = { type: P2pSignalType; payload: string };
export type P2pConnectionState = "idle" | "connecting" | "connected" | "failed" | "closed";
export type P2pIceServer = { urls: string[]; username?: string; credential?: string };

type StartOptions = {
  isCaller: boolean;
  kind: "audio" | "video";
  iceServers?: P2pIceServer[];
  onSignal: (signal: P2pSignal) => Promise<void> | void;
  onState: (state: P2pConnectionState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
};

/**
 * WebRTC transport for one-to-one calls only. Signaling is supplied by the
 * protected server queue; this class never persists SDP/ICE on the device.
 * A public STUN server assists direct connectivity but does not guarantee it,
 * so callers must use the five-second fallback policy when it remains pending.
 */
export class P2pCall {
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private options: StartOptions | null = null;
  private connected = false;

  async start(options: StartOptions) {
    await this.disconnect();
    this.options = options;
    options.onState("connecting");

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: options.kind === "video" ? { facingMode: "user", frameRate: 30, width: 1280, height: 720 } : false,
    });
    this.localStream = stream;

    const peer = new RTCPeerConnection({
      iceServers: options.iceServers?.length
        ? options.iceServers
        : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
    });
    this.peer = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (event) => {
      const candidate = (event as unknown as { candidate?: unknown }).candidate;
      if (candidate) void options.onSignal({ type: "ice", payload: JSON.stringify(candidate) });
    };
    peer.ontrack = (event) => {
      const remote = (event as unknown as { streams?: MediaStream[] }).streams?.[0] ?? null;
      options.onRemoteStream(remote);
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        this.connected = true;
        options.onState("connected");
      } else if (state === "failed" || state === "disconnected") {
        this.connected = false;
        options.onState("failed");
      } else if (state === "closed") {
        options.onState("closed");
      }
    };

    if (options.isCaller) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await options.onSignal({ type: "offer", payload: JSON.stringify(offer) });
    }
  }

  async handleSignal(signal: P2pSignal) {
    const peer = this.peer;
    const options = this.options;
    if (!peer || !options) throw new Error("Kết nối P2P chưa sẵn sàng.");
    const payload = JSON.parse(signal.payload) as Record<string, unknown>;
    if (signal.type === "offer") {
      if (options.isCaller) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload as { type: string; sdp: string }));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await options.onSignal({ type: "answer", payload: JSON.stringify(answer) });
      return;
    }
    if (signal.type === "answer") {
      if (!options.isCaller) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload as { type: string; sdp: string }));
      return;
    }
    await peer.addIceCandidate(payload);
  }

  isConnected() {
    return this.connected;
  }

  getRemoteStream() {
    return null;
  }

  getLocalStream() {
    return this.localStream;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async setCameraEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
  }

  async switchCamera() {
    const track = this.localStream?.getVideoTracks()[0] as (MediaStreamTrack & { _switchCamera?: () => void }) | undefined;
    if (!track?._switchCamera) throw new Error("Camera trước/sau không khả dụng.");
    track._switchCamera();
  }

  async setVideoQuality(quality: "sd" | "hd") {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints(quality === "hd" ? { width: 1280, height: 720, frameRate: 30 } : { width: 640, height: 360, frameRate: 20 });
  }

  async disconnect() {
    this.connected = false;
    this.peer?.close();
    this.peer = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.options?.onRemoteStream(null);
    this.options?.onState("closed");
    this.options = null;
  }
}
