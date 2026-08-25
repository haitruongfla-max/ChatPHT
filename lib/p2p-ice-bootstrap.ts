import type { P2pIceServer } from "@/lib/p2p-call";

export const DIRECT_STUN_FALLBACK: P2pIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export type P2pIceBootstrapSource = "server" | "fallback";

/**
 * TURN is obtained only from the authenticated server endpoint.  A stalled
 * endpoint must not prevent a same-network P2P offer from being created: in
 * that case use public STUN only and let the call surface its real state.
 */
export async function resolveP2pIceServers(
  cached: P2pIceServer[] | undefined,
  refresh: () => Promise<{ iceServers?: P2pIceServer[] } | undefined>,
  timeoutMs = 3_000,
): Promise<{ iceServers: P2pIceServer[]; source: P2pIceBootstrapSource }> {
  if (cached?.length) return { iceServers: cached, source: "server" };

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const response = await Promise.race([
      refresh(),
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
    const iceServers = response?.iceServers;
    if (iceServers?.length) return { iceServers, source: "server" };
  } catch {
    // Do not expose transport errors or credentials in the call UI.
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return { iceServers: DIRECT_STUN_FALLBACK, source: "fallback" };
}
