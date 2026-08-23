import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStreamTrack,
} from "@livekit/react-native-webrtc";
import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { Platform } from "react-native";

export type P2pSignalType = "offer" | "answer" | "ice";
export type P2pSignal = { type: P2pSignalType; payload: string };
export type P2pConnectionState = "idle" | "connecting" | "recovering" | "connected" | "failed" | "closed";
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
  private remoteStream: MediaStream | null = null;
  private options: StartOptions | null = null;
  private connected = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryInProgress = false;
  private remoteDescriptionReady = false;
  private pendingRemoteCandidates: Record<string, unknown>[] = [];

  async start(options: StartOptions) {
    await this.disconnect();
    this.options = options;
    this.remoteDescriptionReady = false;
    this.pendingRemoteCandidates = [];
    options.onState("connecting");

    await this.configureAudio();

    const audioProcessingConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
    };
    const stream = await mediaDevices.getUserMedia({
      // Request the platform's WebRTC audio processing for the direct path as
      // well. The LiveKit fallback already requests equivalent constraints.
      audio: audioProcessingConstraints as unknown as boolean,
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
      if (remote) {
        this.remoteStream = remote;
        options.onRemoteStream(remote);
      }
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        this.connected = true;
        this.recoveryInProgress = false;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        options.onState("connected");
      } else if (state === "failed" || state === "disconnected") {
        this.connected = false;
        void this.recoverIceOrFail();
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
      this.remoteDescriptionReady = true;
      await this.applyPendingIceCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await options.onSignal({ type: "answer", payload: JSON.stringify(answer) });
      return;
    }
    if (signal.type === "answer") {
      if (!options.isCaller) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload as { type: string; sdp: string }));
      this.remoteDescriptionReady = true;
      await this.applyPendingIceCandidates();
      return;
    }
    if (!this.remoteDescriptionReady) {
      this.pendingRemoteCandidates.push(payload);
      return;
    }
    await peer.addIceCandidate(payload);
  }

  isConnected() {
    return this.connected;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  getLocalStream() {
    return this.localStream;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async setSpeakerEnabled(enabled: boolean) {
    if (Platform.OS === "ios") {
      await AudioSession.selectAudioOutput(enabled ? "force_speaker" : "default");
      return;
    }
    const outputs = await AudioSession.getAudioOutputs();
    const preferred = enabled ? "speaker" : "earpiece";
    const selected = outputs.includes(preferred) ? preferred : outputs.includes("speaker") ? "speaker" : outputs[0];
    if (selected) await AudioSession.selectAudioOutput(selected);
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

  async disconnect(options: { preserveAudioSession?: boolean } = {}) {
    this.connected = false;
    this.recoveryInProgress = false;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.peer?.close();
    this.peer = null;
    this.remoteDescriptionReady = false;
    this.pendingRemoteCandidates = [];
    this.remoteStream = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.options?.onRemoteStream(null);
    this.options?.onState("closed");
    this.options = null;
    if (!options.preserveAudioSession) await AudioSession.stopAudioSession().catch(() => undefined);
  }

  /** Restores routing after an attempted LiveKit handoff fails while P2P is still live. */
  async restoreAudioSession() {
    if (!this.localStream) return;
    await this.configureAudio();
  }

  private async configureAudio() {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ["speaker", "bluetooth", "headset", "earpiece"],
        audioTypeOptions: { ...AndroidAudioTypePresets.communication, forceHandleAudioRouting: true },
      },
      ios: { defaultOutput: "speaker" },
    });
    await AudioSession.setDefaultRemoteAudioTrackVolume(1);
    await AudioSession.startAudioSession();
  }

  private async recoverIceOrFail() {
    const peer = this.peer;
    const options = this.options;
    if (!peer || !options || this.recoveryInProgress) return;
    this.recoveryInProgress = true;
    options.onState("recovering");
    try {
      // The caller renews ICE candidates and renegotiates. The callee accepts
      // this standard offer via the existing protected signaling channel.
      if (options.isCaller) {
        const restartable = peer as RTCPeerConnection & { restartIce?: () => void };
        restartable.restartIce?.();
        const offer = await peer.createOffer({ iceRestart: true });
        await peer.setLocalDescription(offer);
        await options.onSignal({ type: "offer", payload: JSON.stringify(offer) });
      }
      this.recoveryTimer = setTimeout(() => {
        if (!this.connected) {
          this.recoveryInProgress = false;
          options.onState("failed");
        }
      }, 6_000);
    } catch {
      this.recoveryInProgress = false;
      options.onState("failed");
    }
  }

  private async applyPendingIceCandidates() {
    const peer = this.peer;
    if (!peer || !this.remoteDescriptionReady || this.pendingRemoteCandidates.length === 0) return;
    const candidates = this.pendingRemoteCandidates;
    this.pendingRemoteCandidates = [];
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate);
    }
  }
}
