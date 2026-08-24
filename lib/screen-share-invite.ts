const SCREEN_SHARE_INVITE_PREFIX = "chatpht:screen-share:";

export function createScreenShareInviteBody(sessionId: string) {
  return `${SCREEN_SHARE_INVITE_PREFIX}${sessionId}`;
}

export function parseScreenShareInviteBody(body: string | null | undefined) {
  if (!body?.startsWith(SCREEN_SHARE_INVITE_PREFIX)) return null;
  const sessionId = body.slice(SCREEN_SHARE_INVITE_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    ? sessionId
    : null;
}
