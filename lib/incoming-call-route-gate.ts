/**
 * The ringing watcher and push handler are both mounted at the app root.
 * They must never mount two call surfaces for the same incoming session,
 * because two native peers would capture media and answer one offer twice.
 */
let claimedIncomingCallId: string | null = null;

export function claimIncomingCallRoute(callId: string) {
  if (!callId || claimedIncomingCallId) return false;
  claimedIncomingCallId = callId;
  return true;
}

export function releaseIncomingCallRoute(callId?: string) {
  if (!callId || claimedIncomingCallId === callId) claimedIncomingCallId = null;
}

/** Test-only reset; it is not referenced by application code. */
export function resetIncomingCallRouteGateForTest() {
  claimedIncomingCallId = null;
}
