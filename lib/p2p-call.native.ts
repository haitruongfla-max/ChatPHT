import { MediaStream, RTCPeerConnection, RTCSessionDescription, type MediaStreamTrack } from "react-native-webrtc";

import { resetAndroidCallSpeakerRoute } from "@/lib/android-audio-route";
import { P2pAudioCall } from "./p2p-audio-call";
import type { P2pCallMode } from "./p2p-call-mode";
import { P2pScreenCall } from "./p2p-screen-call";
import { P2pVideoCall } from "./p2p-video-call";

export type P2pSignalType = "offer" | "answer" | "ice";
export type P2pSignal = { type: P2pSignalType; payload: string };
export type P2pConnectionState = "idle" | "connecting" | "recovering" | "connected" | "failed" | "closed";
export type P2pIceServer = { urls: string[]; username?: string; credential?: string };
export type P2pNetworkStats = { latencyMs: number | null };

type StartOptions = {
  isCaller: boolean;
  kind: "audio" | "video";
  mode: P2pCallMode;
  iceServers?: P2pIceServer[];
  onSignal: (signal: P2pSignal) => Promise<void> | void;
  onState: (state: P2pConnectionState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onStats?: (stats: P2pNetworkStats) => void;
};

/**
 * Protected one-to-one WebRTC transport. A start call selects exactly one
 * immutable media session. Signaling remains authenticated through MySQL/tRPC.
 */
export class P2pCall {
  private peer: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private sessionMode: P2pCallMode | null = null;
  private audioCall: P2pAudioCall | null = null;
  private videoCall: P2pVideoCall | null = null;
  private screenCall: P2pScreenCall | null = null;
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
  private nextOfferId = 0;
  private awaitingAnswerForOfferId: number | null = null;
  private signalQueue: Promise<void> = Promise.resolve();
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  async start(options: StartOptions) {
    if (this.sessionMode && this.sessionMode !== options.mode) {
      throw new Error("Phiên P2P đang hoạt động với chế độ khác. Đã chặn để không mở nhầm chia sẻ màn hình.");
    }
    await this.disconnect({ preservePreStartSignals: true });
    this.sessionMode = options.mode;
    this.options = options;
    this.remoteDescriptionReady = false;
    this.pendingRemoteCandidates = [];
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.negotiationPending = false;
    this.negotiationInFlight = false;
    this.pendingIceRestart = false;
    this.nextOfferId = 0;
    this.awaitingAnswerForOfferId = null;
    options.onState("connecting");

    const stream = await this.startImmutableMediaSession(options.mode, options.isCaller);
    this.localStream = stream;

    const peer = new RTCPeerConnection({
      iceServers: options.iceServers?.length
        ? options.iceServers
        : [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
      iceCandidatePoolSize: 8,
    });
    this.peer = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event: { candidate?: unknown }) => {
      const candidate = (event as unknown as { candidate?: unknown }).candidate;
      if (candidate) void options.onSignal({ type: "ice", payload: JSON.stringify(candidate) });
    };
    peer.ontrack = (event: { track?: MediaStreamTrack }) => {
      if (event.track) this.publishRemoteTrack(event.track);
    };
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === "connected") {
        this.connected = true;
        this.recoveryInProgress = false;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        options.onState("connected");
        this.startStatsPolling();
      } else if (state === "failed" || state === "disconnected") {
        this.connected = false;
        this.stopStatsPolling();
        void this.recoverIceOrFail();
      } else if (state === "closed") {
        this.stopStatsPolling();
        options.onState("closed");
      }
    };

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
    if (signal.type === "offer") {
      const offerCollision = this.makingOffer || peer.signalingState !== "stable";
      this.ignoreOffer = offerCollision && options.isCaller;
      if (this.ignoreOffer) return;
      if (offerCollision) await peer.setLocalDescription({ type: "rollback" } as never);
      const description = (payload.description ?? payload) as { type: string; sdp: string };
      const offerId = typeof payload.offerId === "number" ? payload.offerId : null;
      await peer.setRemoteDescription(new RTCSessionDescription(description));
      this.remoteDescriptionReady = true;
      await this.applyPendingIceCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await options.onSignal({ type: "answer", payload: JSON.stringify({ description: peer.localDescription ?? answer, offerId }) });
      await this.flushQueuedOffer();
      return;
    }
    if (signal.type === "answer") {
      const offerId = typeof payload.offerId === "number" ? payload.offerId : null;
      const isLegacyInitialAnswer = offerId === null && this.awaitingAnswerForOfferId === 1;
      if (!options.isCaller || peer.signalingState !== "have-local-offer" || (!isLegacyInitialAnswer && offerId !== this.awaitingAnswerForOfferId)) return;
      const description = (payload.description ?? payload) as { type: string; sdp: string };
      await peer.setRemoteDescription(new RTCSessionDescription(description));
      this.awaitingAnswerForOfferId = null;
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

  async setMicrophoneEnabled(enabled: boolean) {
    if (this.audioCall) return this.audioCall.setMicrophoneEnabled(enabled);
    if (this.videoCall) return this.videoCall.setMicrophoneEnabled(enabled);
    throw new Error("Phiên chia sẻ màn hình không sử dụng microphone.");
  }

  async setSpeakerEnabled(enabled: boolean) {
    if (this.audioCall) return this.audioCall.setSpeakerEnabled(enabled);
    if (this.videoCall) return this.videoCall.setSpeakerEnabled(enabled);
    throw new Error("Phiên chia sẻ màn hình không phát âm thanh.");
  }

  async setCameraEnabled(enabled: boolean) {
    if (!this.videoCall) throw new Error("Camera chỉ khả dụng trong cuộc gọi video.");
    await this.videoCall.setCameraEnabled(enabled);
  }

  async switchCamera() {
    if (!this.videoCall) throw new Error("Đổi camera chỉ khả dụng trong cuộc gọi video.");
    await this.videoCall.switchCamera();
  }

  async setVideoQuality(quality: "sd" | "hd") {
    if (!this.videoCall) throw new Error("Chất lượng video chỉ khả dụng trong cuộc gọi video.");
    await this.videoCall.setQuality(quality);
  }

  async disconnect(options: { preserveAudioSession?: boolean; preservePreStartSignals?: boolean } = {}) {
    this.connected = false;
    this.stopStatsPolling();
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
    this.nextOfferId = 0;
    this.awaitingAnswerForOfferId = null;
    this.remoteStream = null;
    this.sessionMode = null;
    this.options?.onStats?.({ latencyMs: null });
    await this.audioCall?.stop({ preserveAudioRoute: true });
    await this.videoCall?.stop({ preserveAudioRoute: true });
    await this.screenCall?.stop();
    this.audioCall = null;
    this.videoCall = null;
    this.screenCall = null;
    this.localStream = null;
    this.options?.onRemoteStream(null);
    this.options?.onState("closed");
    this.options = null;
    if (!options.preserveAudioSession) await resetAndroidCallSpeakerRoute();
  }

  private async startImmutableMediaSession(mode: P2pCallMode, isCaller: boolean) {
    if (mode === "audio") {
      this.audioCall = new P2pAudioCall();
      return this.audioCall.start();
    }
    if (mode === "video") {
      this.videoCall = new P2pVideoCall();
      return this.videoCall.start();
    }
    this.screenCall = new P2pScreenCall();
    return this.screenCall.start({ isCaller });
  }

  private startStatsPolling() {
    this.stopStatsPolling();
    void this.publishNetworkStats();
    this.statsTimer = setInterval(() => void this.publishNetworkStats(), 2_000);
  }

  private stopStatsPolling() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }

  private async publishNetworkStats() {
    const peer = this.peer as (RTCPeerConnection & { getStats?: () => Promise<Map<string, unknown> | unknown[]> }) | null;
    const onStats = this.options?.onStats;
    if (!peer || !onStats || !peer.getStats) return;
    try {
      const rawStats = await peer.getStats();
      const reports = rawStats instanceof Map ? Array.from(rawStats.values()) : Array.isArray(rawStats) ? rawStats : [];
      let roundTripTime: number | null = null;
      for (const report of reports) {
        const item = report as Record<string, unknown>;
        const type = item.type;
        const rtt = item.currentRoundTripTime ?? item.roundTripTime;
        if (typeof rtt !== "number" || !Number.isFinite(rtt) || rtt < 0) continue;
        if (type === "candidate-pair" && (item.nominated === true || item.selected === true || item.state === "succeeded")) {
          roundTripTime = rtt;
          break;
        }
        if (roundTripTime === null && type === "remote-inbound-rtp") roundTripTime = rtt;
      }
      onStats({ latencyMs: roundTripTime === null ? null : Math.round(roundTripTime * 1_000) });
    } catch {
      // Statistics are best-effort only; an unavailable SDK report must not affect the call.
      onStats({ latencyMs: null });
    }
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
      const offerId = ++this.nextOfferId;
      this.awaitingAnswerForOfferId = offerId;
      await onSignal({ type: "offer", payload: JSON.stringify({ description: peer.localDescription ?? offer, offerId }) });
    } finally {
      this.makingOffer = false;
      this.negotiationInFlight = false;
    }
  }

  private publishRemoteTrack(track: MediaStreamTrack) {
    if (!this.remoteStream) this.remoteStream = new MediaStream();
    if (!this.remoteStream.getTracks().some((item) => item.id === track.id)) this.remoteStream.addTrack(track);
    track.onended = () => {
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
}
