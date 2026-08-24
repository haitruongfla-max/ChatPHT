/**
 * The user-facing P2P action. This remains distinct from the database call
 * kind: a screen share is transported through a 1:1 audio call but must never
 * be mistaken for a normal voice call by the UI or media layer.
 */
export const P2P_CALL_MODES = ["audio", "video", "screen"] as const;

export type P2pCallMode = (typeof P2P_CALL_MODES)[number];
export type P2pCallKind = "audio" | "video";

export function toP2pCallMode(value: unknown): P2pCallMode {
  return value === "video" || value === "screen" ? value : "audio";
}

export function callKindForP2pMode(mode: P2pCallMode): P2pCallKind {
  return mode === "video" ? "video" : "audio";
}
