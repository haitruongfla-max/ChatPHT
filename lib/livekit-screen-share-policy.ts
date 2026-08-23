/**
 * Only retry the transient publication acknowledgement failure once. A denied
 * MediaProjection prompt must not be retried because Android requires an
 * explicit user action for every screen-capture session.
 */
export function shouldRetryScreenSharePublication(error: unknown, attempt: number) {
  if (attempt > 0) return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /publication of local track timed out|timed out.*response from server|android không phản hồi việc phát track/i.test(message);
}
