/**
 * The browser preview intentionally does not poll for native-only call rooms.
 * This prevents a web session from navigating into the native WebRTC runtime.
 */
export function IncomingCallWatcher() {
  return null;
}
