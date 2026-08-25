import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  type MediaStream,
} from "react-native-webrtc";

export type VoiceSignalType = "offer" | "answer" | "ice";
export type VoiceSignal = { type: VoiceSignalType; payload: string };
export type VoiceConnectionState = "new" | "connecting" | "connected" | "recovering" | "failed" | "closed";
export type VoiceIceServer = { urls: string | string[]; username?: string; credential?: string };

const FALLBACK_ICE_SERVERS: VoiceIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

/**
 * A deliberately small audio-only WebRTC owner. This module has no camera,
 * display-capture or mode argument, so a voice call cannot become video/screen.
 */
export class VoiceP2pPeer {
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidate[] = [];
  private startPromise: Promise<void> | null = null;
  private stopped = false;
  private restartInFlight = false;

  constructor(
    private readonly isCaller: boolean,
    private readonly sendSignal: (signal: VoiceSignal) => Promise<void>,
    private readonly onState: (state: VoiceConnectionState) => void,
    private readonly iceServers: VoiceIceServer[] = FALLBACK_ICE_SERVERS,
  ) {}

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  private async startInternal() {
    this.stopped = false;
    const peer = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peer = peer;
    peer.onicecandidate = (event: { candidate: RTCIceCandidate | null }) => {
      if (!event.candidate || this.stopped) return;
      void this.sendSignal({ type: "ice", payload: JSON.stringify(event.candidate) }).catch(() => this.onState("failed"));
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") this.onState("connected");
      else if (state === "connecting") this.onState("connecting");
      else if (state === "failed") {
        this.onState("failed");
        void this.restartIce();
      } else if (state === "disconnected") {
        this.onState("recovering");
        void this.restartIce();
      } else if (state === "closed") this.onState("closed");
    };
    this.onState("connecting");
    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      } as unknown as boolean,
      video: false,
    });
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("VOICE_PEER_STOPPED");
    }
    this.stream = stream;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    if (this.isCaller) await this.createAndSendOffer(false);
  }

  async handleSignal(signal: VoiceSignal) {
    await this.startPromise;
    const peer = this.peer;
    if (!peer || this.stopped) return;
    if (signal.type === "offer") {
      const offer = JSON.parse(signal.payload);
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.sendSignal({ type: "answer", payload: JSON.stringify(answer) });
      return;
    }
    if (signal.type === "answer") {
      const answer = JSON.parse(signal.payload);
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      await this.flushCandidates();
      return;
    }
    const candidate = new RTCIceCandidate(JSON.parse(signal.payload));
    if (!peer.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await peer.addIceCandidate(candidate);
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async stop() {
    this.stopped = true;
    this.pendingCandidates = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.peer?.close();
    this.peer = null;
    this.onState("closed");
  }

  private async flushCandidates() {
    const peer = this.peer;
    if (!peer) return;
    const queued = this.pendingCandidates.splice(0);
    for (const candidate of queued) await peer.addIceCandidate(candidate);
  }

  private async createAndSendOffer(iceRestart: boolean) {
    const peer = this.peer;
    if (!peer || this.stopped || !this.isCaller) return;
    const offer = await peer.createOffer(iceRestart ? { iceRestart: true } : undefined);
    await peer.setLocalDescription(offer);
    await this.sendSignal({ type: "offer", payload: JSON.stringify(offer) });
  }

  private async restartIce() {
    if (!this.isCaller || this.restartInFlight || this.stopped) return;
    this.restartInFlight = true;
    try {
      await this.createAndSendOffer(true);
    } catch {
      this.onState("failed");
    } finally {
      this.restartInFlight = false;
    }
  }
}
