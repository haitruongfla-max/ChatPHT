import type { P2pCallMode } from "@/lib/p2p-call-mode";

/**
 * Every P2P mode owns a concrete route. Do not collapse these paths back into
 * `/call`: a route is the first safety boundary before any media is captured.
 */
export const P2P_CALL_ROUTE: Record<P2pCallMode, "/call/audio" | "/call/video" | "/call/screen"> = {
  audio: "/call/audio",
  video: "/call/video",
  screen: "/call/screen",
};

export function p2pCallRoute(mode: P2pCallMode) {
  return P2P_CALL_ROUTE[mode];
}
