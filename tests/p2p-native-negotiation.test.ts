import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const peerInstances: any[] = [];

  class FakeMediaStream {
    private tracks: any[] = [];

    addTrack(track: any) { this.tracks.push(track); }
    removeTrack(track: any) { this.tracks = this.tracks.filter((item) => item.id !== track.id); }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
    getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  }

  class FakePeer {
    signalingState = "stable";
    connectionState = "new";
    onicecandidate?: (event: unknown) => void;
    ontrack?: (event: unknown) => void;
    onconnectionstatechange?: () => void;
    offerCalls: Array<{ iceRestart?: boolean }> = [];
    addIceCandidate = vi.fn();
    removeTrack = vi.fn();
    close = vi.fn();
    getStats = vi.fn(async () => new Map([["pair", { type: "candidate-pair", nominated: true, state: "succeeded", currentRoundTripTime: 0.042 }]]));

    configuration: Record<string, unknown>;
    constructor(configuration: Record<string, unknown> = {}) {
      this.configuration = configuration;
      peerInstances.push(this);
    }
    addTrack(track: any) { return { track }; }
    async createOffer(options: { iceRestart?: boolean } = {}) {
      this.offerCalls.push(options);
      return { type: "offer", sdp: `offer-${this.offerCalls.length}` };
    }
    async createAnswer() { return { type: "answer", sdp: "answer" }; }
    async setLocalDescription(description: { type: string }) {
      this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
    }
    async setRemoteDescription(description: { type: string }) {
      this.signalingState = description.type === "answer" ? "stable" : "have-remote-offer";
    }
  }

  function createTrack(id: string, kind: "audio" | "video" = "video") {
    const track: any = {
      id,
      kind,
      readyState: "live",
      enabled: true,
      applyConstraints: vi.fn(),
      stop: () => {
        track.readyState = "ended";
        track.onended?.();
      },
    };
    return track;
  }

  const getUserMedia = vi.fn(async (constraints: { audio?: boolean; video?: boolean }) => {
    const stream = new FakeMediaStream();
    if (constraints.audio) stream.addTrack(createTrack(`audio-${getUserMedia.mock.calls.length}`, "audio"));
    if (constraints.video) stream.addTrack(createTrack(`camera-${getUserMedia.mock.calls.length}`, "video"));
    return stream;
  });
  const getDisplayMedia = vi.fn(async () => {
    const stream = new FakeMediaStream();
    stream.addTrack(createTrack("screen-track-1"));
    return stream;
  });

  return { FakeMediaStream, FakePeer, getUserMedia, getDisplayMedia, peerInstances };
});

vi.mock("react-native-webrtc", () => ({
  mediaDevices: { getUserMedia: mocks.getUserMedia, getDisplayMedia: mocks.getDisplayMedia },
  MediaStream: mocks.FakeMediaStream,
  RTCPeerConnection: mocks.FakePeer,
  RTCSessionDescription: class {
    constructor(value: Record<string, unknown>) { Object.assign(this, value); }
  },
}));

vi.mock("@/lib/android-audio-route", () => ({
  setAndroidCallSpeakerRoute: vi.fn(async () => undefined),
  resetAndroidCallSpeakerRoute: vi.fn(async () => undefined),
}));

import { P2pCall } from "../lib/p2p-call.native";

describe("native P2P renegotiation", () => {
  beforeEach(() => {
    mocks.peerInstances.length = 0;
    mocks.getUserMedia.mockClear();
    mocks.getDisplayMedia.mockClear();
  });

  it("starts a standalone screen session with display plus microphone tracks, without changing call mode", async () => {
    const signals: Array<{ type: string; payload: string }> = [];
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "screen",
      onSignal: async (signal) => { signals.push(signal); },
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    const peer = mocks.peerInstances[0]!;
    expect(mocks.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(mocks.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
    expect(signals.map((signal) => signal.type)).toEqual(["offer"]);
    expect(peer.offerCalls).toHaveLength(1);

    await call.handleSignal({ type: "answer", payload: JSON.stringify({ description: { type: "answer", sdp: "initial-answer" }, offerId: 1 }) });
    expect(peer.signalingState).toBe("stable");
    expect(peer.offerCalls).toHaveLength(1);
  });

  it("allows only the screen caller to add an optional camera track and renegotiates after the initial answer", async () => {
    const signals: Array<{ type: string; payload: string }> = [];
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "screen",
      onSignal: async (signal) => { signals.push(signal); },
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    await call.handleSignal({ type: "answer", payload: JSON.stringify({ description: { type: "answer", sdp: "initial-answer" }, offerId: 1 }) });
    await call.setScreenCameraEnabled(true);

    expect(mocks.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false, video: expect.any(Object) }));
    expect(signals.map((signal) => signal.type)).toEqual(["offer", "offer"]);
    expect((call as any).sessionMode).toBe("screen");
  });

  it("does not capture display or camera when the screen recipient joins", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: false,
      kind: "audio",
      mode: "screen",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });

    await expect(call.setScreenCameraEnabled(true)).rejects.toThrow("Chỉ người đang chia sẻ");
    expect(mocks.getDisplayMedia).not.toHaveBeenCalled();
    expect(mocks.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("refuses to change an active audio session into screen sharing", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });

    await expect(call.start({
      isCaller: true,
      kind: "audio",
      mode: "screen",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    })).rejects.toThrow("chế độ khác");

    expect(mocks.getUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.getDisplayMedia).not.toHaveBeenCalled();
  });

  it("reports latency only from a successful WebRTC candidate pair", async () => {
    const onStats = vi.fn();
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
      onStats,
    });
    const peer = mocks.peerInstances[0]!;
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    await Promise.resolve();

    expect(onStats).toHaveBeenCalledWith({ latencyMs: 42 });
    await call.disconnect();
    expect(onStats).toHaveBeenLastCalledWith({ latencyMs: null });
  });

  it("drops ICE candidates belonging to a colliding offer that the caller intentionally ignores", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    const peer = mocks.peerInstances[0]!;

    await call.handleSignal({ type: "offer", payload: JSON.stringify({ type: "offer", sdp: "colliding" }) });
    await call.handleSignal({ type: "ice", payload: JSON.stringify({ candidate: "candidate-for-colliding-offer" }) });

    expect((call as any).pendingRemoteCandidates).toEqual([]);
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
  });

  it("keeps an offer received before Android finishes starting the recipient peer", async () => {
    const signals: Array<{ type: string; payload: string }> = [];
    const call = new P2pCall();

    await call.handleSignal({ type: "offer", payload: JSON.stringify({ type: "offer", sdp: "early-offer" }) });
    await call.start({
      isCaller: false,
      kind: "video",
      mode: "video",
      onSignal: async (signal) => { signals.push(signal); },
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });

    expect(signals.map((signal) => signal.type)).toEqual(["answer"]);
  });

  it("bridges an accepted 1:1 call from caller offer through recipient answer and ICE", async () => {
    const signalsToRecipient: Array<{ type: "offer" | "answer" | "ice"; payload: string }> = [];
    const signalsToCaller: Array<{ type: "offer" | "answer" | "ice"; payload: string }> = [];
    const callerProgress = vi.fn();
    const recipientProgress = vi.fn();
    const caller = new P2pCall();
    const recipient = new P2pCall();

    // This is the transport sequence invoked immediately after calls.get returns status: active.
    await caller.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: async (signal) => { signalsToRecipient.push(signal); },
      onSignalProgress: callerProgress,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    expect(signalsToRecipient.map((signal) => signal.type)).toEqual(["offer"]);

    await recipient.handleSignal(signalsToRecipient[0]!);
    await recipient.start({
      isCaller: false,
      kind: "audio",
      mode: "audio",
      onSignal: async (signal) => { signalsToCaller.push(signal); },
      onSignalProgress: recipientProgress,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    expect(signalsToCaller.map((signal) => signal.type)).toEqual(["answer"]);

    await caller.handleSignal(signalsToCaller[0]!);
    expect(mocks.peerInstances[0]?.signalingState).toBe("stable");
    expect(callerProgress).toHaveBeenCalledWith({ direction: "sent", type: "offer" });
    expect(recipientProgress).toHaveBeenCalledWith({ direction: "received", type: "offer" });
    expect(recipientProgress).toHaveBeenCalledWith({ direction: "sent", type: "answer" });
    expect(callerProgress).toHaveBeenCalledWith({ direction: "received", type: "answer" });

    const callerPeer = mocks.peerInstances[0]!;
    callerPeer.onicecandidate?.({ candidate: { candidate: "caller-ice" } });
    await Promise.resolve();
    await Promise.resolve();
    const ice = signalsToRecipient.find((signal) => signal.type === "ice");
    expect(ice).toBeDefined();
    await recipient.handleSignal(ice!);
    expect(mocks.peerInstances[1]?.addIceCandidate).toHaveBeenCalledWith({ candidate: "caller-ice" });
    expect(callerProgress).toHaveBeenCalledWith({ direction: "sent", type: "ice" });
    expect(recipientProgress).toHaveBeenCalledWith({ direction: "received", type: "ice" });
  });

  it("reports safe bootstrap milestones before it writes the first offer", async () => {
    const phases = vi.fn();
    const call = new P2pCall();

    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: () => undefined,
      onBootstrapPhase: phases,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });

    expect(phases).toHaveBeenNthCalledWith(1, "media-ready");
    expect(phases).toHaveBeenNthCalledWith(2, "peer-ready");
    expect(phases).toHaveBeenNthCalledWith(3, "offer-created");
  });

  it("surfaces a signal send failure without exposing signaling payload or credentials", async () => {
    const onSignalError = vi.fn();
    const call = new P2pCall();

    await expect(call.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: async () => { throw new Error("credential=private-value"); },
      onSignalError,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    })).rejects.toThrow("P2P_SIGNAL_SEND_FAILED");

    expect(onSignalError).toHaveBeenCalledWith({ type: "offer" });
    expect(String(onSignalError.mock.calls)).not.toContain("private-value");
  });

  it("serializes duplicate answers while Android is still committing the first remote SDP", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "video",
      mode: "video",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    const peer = mocks.peerInstances[0]!;
    let releaseFirstAnswer: (() => void) | undefined;
    const firstAnswerCommitted = new Promise<void>((resolve) => { releaseFirstAnswer = resolve; });
    const setRemoteDescription = vi.spyOn(peer, "setRemoteDescription").mockImplementation(async (description) => {
      await firstAnswerCommitted;
      const remoteDescription = description as { type: string };
      peer.signalingState = remoteDescription.type === "answer" ? "stable" : "have-remote-offer";
    });
    const answer = { type: "answer" as const, payload: JSON.stringify({ description: { type: "answer", sdp: "same-answer" }, offerId: 1 }) };

    const first = call.handleSignal(answer);
    const duplicate = call.handleSignal(answer);
    await Promise.resolve();
    expect(setRemoteDescription).toHaveBeenCalledTimes(1);

    releaseFirstAnswer?.();
    await Promise.all([first, duplicate]);
    expect(setRemoteDescription).toHaveBeenCalledTimes(1);
  });

  it("never applies an answer belonging to a stale offer even while the peer awaits a local answer", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
      mode: "audio",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    const peer = mocks.peerInstances[0]!;

    await call.handleSignal({ type: "answer", payload: JSON.stringify({ description: { type: "answer", sdp: "stale-answer" }, offerId: 99 }) });

    expect(peer.signalingState).toBe("have-local-offer");
  });

  it("pre-gathers ICE candidates to reduce the Android startup signaling race", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "video",
      mode: "video",
      onSignal: () => undefined,
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });

    expect(mocks.peerInstances[0]?.configuration).toMatchObject({ iceCandidatePoolSize: 8 });
  });
});
