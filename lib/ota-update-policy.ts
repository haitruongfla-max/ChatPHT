export const OTA_FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export function canCheckForOtaUpdate({
  now,
  lastCheckAt,
  isNative,
  isEnabled,
  isCheckRunning,
  hasActiveCall,
}: {
  now: number;
  lastCheckAt: number;
  isNative: boolean;
  isEnabled: boolean;
  isCheckRunning: boolean;
  hasActiveCall: boolean;
}) {
  if (!isNative || !isEnabled || isCheckRunning || hasActiveCall) return false;
  return now - lastCheckAt >= OTA_FOREGROUND_CHECK_INTERVAL_MS;
}
