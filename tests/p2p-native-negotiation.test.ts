import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const peerInstances: any[] = [];

  class FakeMediaStream {
    private tracks: any[] = [];

    addTrack(track: any) { this.tracks.push(track); }
    removeTrack(track: any) { this.tracks = this.tracks.filter((item) => item.id !== track.id); }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks; }
    getAudioTracks() { return []; }
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

    constructor() { peerInstances.push(this); }
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

  function createTrack(id: string) {
    const track: any = {
      id,
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

  const getUserMedia = vi.fn(async () => new FakeMediaStream());
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

  it("queues a screen-track offer until the original offer receives its answer", async () => {
    const signals: Array<{ type: string; payload: string }> = [];
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "video",
      onSignal: async (signal) => { signals.push(signal); },
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });
    const peer = mocks.peerInstances[0]!;
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();

    await call.startScreenShare();
    expect(signals.map((signal) => signal.type)).toEqual(["offer", "screen-start"]);
    expect(peer.offerCalls).toHaveLength(1);

    await call.handleSignal({ type: "answer", payload: JSON.stringify({ type: "answer", sdp: "initial-answer" }) });
    expect(signals.map((signal) => signal.type)).toEqual(["offer", "screen-start", "offer"]);
    expect(peer.offerCalls).toHaveLength(2);
  });

  it("drops ICE candidates belonging to a colliding offer that the caller intentionally ignores", async () => {
    const call = new P2pCall();
    await call.start({
      isCaller: true,
      kind: "audio",
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
      onSignal: async (signal) => { signals.push(signal); },
      onState: () => undefined,
      onRemoteStream: () => undefined,
    });

    expect(signals.map((signal) => signal.type)).toEqual(["answer"]);
  });
});
