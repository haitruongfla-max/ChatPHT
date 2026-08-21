/**
 * TypeScript/web-safe facade. Metro selects livekit-bootstrap.native.ts on
 * iOS/Android, where the actual WebRTC global registration takes place.
 */
export function ensureLiveKitGlobals() {
  // No native WebRTC runtime is available in this module.
}
