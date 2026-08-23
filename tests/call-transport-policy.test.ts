import { describe, expect, it } from "vitest";

import { P2P_FALLBACK_TIMEOUT_MS, selectFallbackTransport, selectInitialCallTransport, shouldFallbackToLiveKit } from "../lib/call-transport-policy";

describe("call transport policy", () => {
  it("only attempts P2P for a supported direct two-party call", () => {
    expect(selectInitialCallTransport({ isGroup: false, participantCount: 2, p2pSupported: true })).toEqual({ transport: "p2p", reason: "direct-two-party" });
  });

  it("always selects LiveKit for group or non-two-party calls", () => {
    expect(selectInitialCallTransport({ isGroup: true, participantCount: 2, p2pSupported: true })).toEqual({ transport: "livekit", reason: "group-call" });
    expect(selectInitialCallTransport({ isGroup: false, participantCount: 3, p2pSupported: true })).toEqual({ transport: "livekit", reason: "participant-count" });
  });

  it("falls back only after a full six-second unsuccessful P2P attempt", () => {
    expect(shouldFallbackToLiveKit({ elapsedMs: P2P_FALLBACK_TIMEOUT_MS - 1, p2pConnected: false })).toBe(false);
    expect(selectFallbackTransport({ elapsedMs: P2P_FALLBACK_TIMEOUT_MS, p2pConnected: false })).toEqual({ transport: "livekit", reason: "p2p-timeout" });
    expect(selectFallbackTransport({ elapsedMs: P2P_FALLBACK_TIMEOUT_MS + 100, p2pConnected: true })).toBeNull();
  });
});
