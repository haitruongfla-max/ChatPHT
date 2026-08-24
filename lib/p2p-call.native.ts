import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStreamTrack,
} from "react-native-webrtc";

import { resetAndroidCallSpeakerRoute, setAndroidCallSpeakerRoute } from "@/lib/android-audio-route";

export type P2pSignalType = "offer" | "answer" | "ice" | "screen-start" | "screen-stop";
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
  onRemoteScreenStream?: (stream: MediaStream | null) => void;
};

/**
 * Protected one-to-one WebRTC transport. SDP and ICE travel only through the
 * authenticated server signal queue. It never creates an SFU room or token.
 */
export class P2pCall {
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private remoteScreenStream: MediaStream | null = null;
  private screenSenders: Array<ReturnType<RTCPeerConnection["addTrack"]>> = [];
  private remoteScreenTrackIds = new Set<string>();
  private remoteTracks = new Map<string, MediaStreamTrack>();
  private options: StartOptions | null = null;
  private connected = false;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryInProgress = false;
  private remoteDescriptionReady = false;
  private pendingRemoteCandidates: Record<string, unknown>[] = [];
  private preStartSignals: P2pSignal[] = [];
  private makingOffer = false;
  private ignoreOffer = false;
  private negotiationPending = false;
  private negotiationInFlight = false;
  private pendingIceRestart = false;
  // Signal polling can deliver a batch while Android has not yet committed the
  // preceding SDP operation. Serialize it so a duplicate answer never calls
  // setRemoteDescription while the peer is already becoming stable.
  private signalQueue: Promise<void> = Promise.resolve();

  async start(options: StartOptions) {
    await this.disconnect({ preservePreStartSignals: true });
    this.options = options;
    this.remoteDescriptionReady = false;
    this.pendingRemoteCandidates = [];
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.negotiationPending = false;
    this.negotiationInFlight = false;
    this.pendingIceRestart = false;
    options.onState("connecting");

    const stream = await mediaDevices.getUserMedia({
      // WebRTC maps these constraints to Android's voice-processing path when supported.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, googEchoCancellation: true, googNoiseSuppression: true, googAutoGainControl: true } as unknown as boolean,
      video: options.kind === "video" ? { facingMode: "user", frameRate: 30, width: 1280, height: 720 } : false,
    });
    this.localStream = stream;
    await setAndroidCallSpeakerRoute(options.kind === "video");

    const peer = new RTCPeerConnection({
      iceServers: options.iceServers?.length
        ? options.iceServers
        : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
      // Gather candidates as soon as the peer is created. This narrows the
      // startup race on Android where offer/answer and signal polling overlap.
      iceCandidatePoolSize: 8,
    });
    this.peer = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event: { candidate?: unknown }) => {
      const candidate = (event as unknown as { candidate?: unknown }).candidate;
      if (candidate) void options.onSignal({ type: "ice", payload: JSON.stringify(candidate) });
    };
    peer.ontrack = (event: { track?: MediaStreamTrack }) => {
      const track = event.track;
      if (!track) return;
      this.remoteTracks.set(track.id, track);
      if (this.remoteScreenTrackIds.has(track.id)) {
        this.publishRemoteScreenTrack(track);
        return;
      }
      this.publishRemoteCallTrack(track);
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

    // Signals are polled independently from local media and TURN setup. An
    // early offer must survive until this peer is ready to apply it.
    await this.flushPreStartSignals();
    if (options.isCaller) await this.queueOffer();
  }

  async handleSignal(signal: P2pSignal) {
    const task = this.signalQueue.then(() => this.handleSignalSerial(signal));
    this.signalQueue = task.catch(() => undefined);
    await task;
  }

  private async handleSignalSerial(signal: P2pSignal) {
    const peer = this.peer;
    const options = this.options;
    if (!peer || !options) {
      this.preStartSignals.push(signal);
      return;
    }
    const payload = JSON.parse(signal.payload) as Record<string, unknown>;
    if (signal.type === "screen-start") {
      const trackId = typeof payload.trackId === "string" ? payload.trackId : "";
      if (!trackId) return;
      this.remoteScreenTrackIds.add(trackId);
      const track = this.remoteTracks.get(trackId);
      if (track) this.publishRemoteScreenTrack(track);
      return;
    }
    if (signal.type === "screen-stop") {
      const trackId = typeof payload.trackId === "string" ? payload.trackId : "";
      if (trackId) this.remoteScreenTrackIds.delete(trackId);
      const currentTrack = this.remoteScreenStream?.getVideoTracks()[0] ?? null;
      if (!trackId || currentTrack?.id === trackId) {
        this.remoteScreenStream = null;
        options.onRemoteScreenStream?.(null);
      }
      return;
    }
    if (signal.type === "offer") {
      const offerCollision = this.makingOffer || peer.signalingState !== "stable";
      // The original caller is the impolite peer. This keeps simultaneous
      // camera/screen renegotiations from replacing a valid local offer.
      this.ignoreOffer = offerCollision && options.isCaller;
      if (this.ignoreOffer) return;
      if (offerCollision) await peer.setLocalDescription({ type: "rollback" } as never);
      await peer.setRemoteDescription(new RTCSessionDescription(payload as { type: string; sdp: string }));
      this.remoteDescriptionReady = true;
      await this.applyPendingIceCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await options.onSignal({ type: "answer", payload: JSON.stringify(answer) });
      await this.flushQueuedOffer();
      return;
    }
    if (signal.type === "answer") {
      if (!options.isCaller || peer.signalingState !== "have-local-offer") return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload as { type: string; sdp: string }));
      this.remoteDescriptionReady = true;
      this.ignoreOffer = false;
      await this.applyPendingIceCandidates();
      await this.flushQueuedOffer();
      return;
    }
    if (this.ignoreOffer) return;
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

  getRemoteScreenStream() {
    return this.remoteScreenStream;
  }

  hasScreenShare() {
    return Boolean(this.screenStream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async setSpeakerEnabled(enabled: boolean) {
    await setAndroidCallSpeakerRoute(enabled);
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

  /** Starts MediaProjection through WebRTC, then renegotiates the same 1:1 peer. */
  async startScreenShare() {
    const peer = this.peer;
    if (!peer || !this.connected) throw new Error("Hãy đợi cuộc gọi P2P kết nối rồi mới chia sẻ màn hình.");
    if (this.hasScreenShare()) return this.screenStream;
    const getDisplayMedia = (mediaDevices as typeof mediaDevices & {
      getDisplayMedia?: (constraints: { video: boolean; audio: boolean }) => Promise<MediaStream>;
    }).getDisplayMedia;
    if (!getDisplayMedia) throw new Error("Thiết bị không hỗ trợ MediaProjection để chia sẻ màn hình.");
    const screenStream = await getDisplayMedia({ video: true, audio: false });
    const tracks = screenStream.getVideoTracks();
    if (tracks.length === 0) {
      screenStream.getTracks().forEach((track) => track.stop());
      throw new Error("Android chưa cấp track màn hình. Hãy chấp nhận hộp thoại ghi màn hình rồi thử lại.");
    }
    this.screenStream = screenStream;
    this.screenSenders = tracks.map((track) => peer.addTrack(track, screenStream));
    tracks.forEach((track) => { track.onended = () => { void this.stopScreenShare(); }; });
    try {
      await this.options?.onSignal({ type: "screen-start", payload: JSON.stringify({ trackId: tracks[0].id }) });
      await this.queueOffer();
      return screenStream;
    } catch (error) {
      await this.stopScreenShare();
      throw error;
    }
  }

  /** Stops MediaProjection and renegotiates so the peer removes the screen track. */
  async stopScreenShare() {
    const peer = this.peer;
    const stream = this.screenStream;
    if (!stream) return;
    this.screenStream = null;
    const trackIds = stream.getVideoTracks().map((track) => track.id);
    try {
      await this.options?.onSignal({ type: "screen-stop", payload: JSON.stringify({ trackId: trackIds[0] ?? "" }) });
    } catch {
      // Local cleanup must still run if the peer loses signaling while stopping MediaProjection.
    }
    this.screenSenders.forEach((sender) => {
      try { peer?.removeTrack(sender); } catch { /* peer already closed */ }
    });
    this.screenSenders = [];
    stream.getTracks().forEach((track) => track.stop());
    if (peer && this.connected) await this.queueOffer();
  }

  async disconnect(options: { preserveAudioSession?: boolean; preservePreStartSignals?: boolean } = {}) {
    this.connected = false;
    this.recoveryInProgress = false;
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.peer?.close();
    this.peer = null;
    this.remoteDescriptionReady = false;
    this.pendingRemoteCandidates = [];
    if (!options.preservePreStartSignals) this.preStartSignals = [];
    this.negotiationPending = false;
    this.negotiationInFlight = false;
    this.pendingIceRestart = false;
    this.remoteScreenTrackIds.clear();
    this.remoteTracks.clear();
    this.remoteStream = null;
    this.remoteScreenStream = null;
    this.screenSenders = [];
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.options?.onRemoteStream(null);
    this.options?.onRemoteScreenStream?.(null);
    this.options?.onState("closed");
    this.options = null;
    if (!options.preserveAudioSession) await resetAndroidCallSpeakerRoute();
  }

  private async recoverIceOrFail() {
    const peer = this.peer;
    const options = this.options;
    if (!peer || !options || this.recoveryInProgress) return;
    this.recoveryInProgress = true;
    options.onState("recovering");
    try {
      if (options.isCaller) {
        const restartable = peer as RTCPeerConnection & { restartIce?: () => void };
        restartable.restartIce?.();
        await this.queueOffer({ iceRestart: true });
      }
      this.recoveryTimer = setTimeout(() => {
        if (!this.connected) {
          this.recoveryInProgress = false;
          options.onState("failed");
        }
      }, 8_000);
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
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }

  private async flushPreStartSignals() {
    const signals = this.preStartSignals;
    this.preStartSignals = [];
    for (const signal of signals) await this.handleSignalSerial(signal);
  }

  private async queueOffer(options: { iceRestart?: boolean } = {}) {
    this.negotiationPending = true;
    this.pendingIceRestart ||= Boolean(options.iceRestart);
    await this.flushQueuedOffer();
  }

  private async flushQueuedOffer() {
    const peer = this.peer;
    const onSignal = this.options?.onSignal;
    if (!peer || !onSignal || !this.negotiationPending || this.negotiationInFlight || peer.signalingState !== "stable") return;
    const iceRestart = this.pendingIceRestart;
    this.negotiationPending = false;
    this.pendingIceRestart = false;
    this.negotiationInFlight = true;
    this.makingOffer = true;
    try {
      const offer = await peer.createOffer(iceRestart ? { iceRestart: true } : {});
      await peer.setLocalDescription(offer);
      await onSignal({ type: "offer", payload: JSON.stringify(offer) });
    } finally {
      this.makingOffer = false;
      this.negotiationInFlight = false;
    }
  }

  private publishRemoteCallTrack(track: MediaStreamTrack) {
    if (!this.remoteStream) this.remoteStream = new MediaStream();
    if (!this.remoteStream.getTracks().some((item) => item.id === track.id)) this.remoteStream.addTrack(track);
    track.onended = () => {
      this.remoteTracks.delete(track.id);
      this.remoteStream?.removeTrack(track);
      if (!this.remoteStream || this.remoteStream.getTracks().length === 0) {
        this.remoteStream = null;
        this.options?.onRemoteStream(null);
      } else {
        this.options?.onRemoteStream(this.remoteStream);
      }
    };
    this.options?.onRemoteStream(this.remoteStream);
  }

  private publishRemoteScreenTrack(track: MediaStreamTrack) {
    this.remoteStream?.removeTrack(track);
    const screen = new MediaStream();
    screen.addTrack(track);
    this.remoteScreenStream = screen;
    track.onended = () => {
      if (this.remoteScreenStream?.getTracks().some((item) => item.id === track.id)) {
        this.remoteScreenStream = null;
        this.options?.onRemoteScreenStream?.(null);
      }
    };
    this.options?.onRemoteStream(this.remoteStream);
    this.options?.onRemoteScreenStream?.(screen);
  }
}
