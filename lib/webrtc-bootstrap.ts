/**
 * TypeScript/web-safe facade. Metro selects webrtc-bootstrap.native.ts on
 * Android/iOS, where native WebRTC globals are registered for P2P calls.
 */
export function ensureWebRtcGlobals() {
  // This fallback intentionally does not initialize a native WebRTC runtime.
}
