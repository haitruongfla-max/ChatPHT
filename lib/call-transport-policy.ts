export const P2P_FALLBACK_TIMEOUT_MS = 6_000;

export type CallTransport = "p2p" | "livekit";
export type CallTransportDecision =
  | { transport: "p2p"; reason: "direct-two-party" }
  | { transport: "livekit"; reason: "group-call" | "participant-count" | "p2p-timeout" | "p2p-unavailable" };

export function selectInitialCallTransport(input: { isGroup: boolean; participantCount: number; p2pSupported: boolean }): CallTransportDecision {
  if (input.isGroup) return { transport: "livekit", reason: "group-call" };
  if (input.participantCount !== 2) return { transport: "livekit", reason: "participant-count" };
  if (!input.p2pSupported) return { transport: "livekit", reason: "p2p-unavailable" };
  return { transport: "p2p", reason: "direct-two-party" };
}

export function shouldFallbackToLiveKit(input: { elapsedMs: number; p2pConnected: boolean }): boolean {
  return !input.p2pConnected && input.elapsedMs >= P2P_FALLBACK_TIMEOUT_MS;
}

export function selectFallbackTransport(input: { elapsedMs: number; p2pConnected: boolean }): CallTransportDecision | null {
  return shouldFallbackToLiveKit(input) ? { transport: "livekit", reason: "p2p-timeout" } : null;
}
