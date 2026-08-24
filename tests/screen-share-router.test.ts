import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  createScreenShareSession: vi.fn(),
  activateScreenShareSession: vi.fn(),
  createMessage: vi.fn(),
  getScreenShareSession: vi.fn(),
  joinScreenShareSession: vi.fn(),
  finishScreenShareSession: vi.fn(),
}));

vi.mock("../server/call-token", () => ({
  createLiveKitCallToken: vi.fn(),
  createLiveKitScreenShareRoom: vi.fn(),
  createLiveKitScreenShareToken: vi.fn(),
}));

vi.mock("../server/push", () => ({
  dispatchIncomingCallPushNotification: vi.fn(),
  dispatchNewMessagePushNotifications: vi.fn(),
}));

import * as db from "../server/db";
import { createLiveKitScreenShareRoom, createLiveKitScreenShareToken } from "../server/call-token";
import { dispatchNewMessagePushNotifications } from "../server/push";
import { appRouter } from "../server/routers";

const sessionId = "980e9075-dd5d-47cf-940f-d79c2e4af250";
const session = {
  id: sessionId,
  room: `chatpht-screen-${sessionId}`,
  conversationId: 18,
  hostId: 7,
  status: "starting",
  expiresAt: new Date("2026-08-24T02:00:00.000Z"),
  startedAt: null,
  endedAt: null,
  host: { id: 7, username: "host", displayName: "Chủ phòng", avatarUrl: null },
};

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId, name: "Thành viên thử nghiệm", username: "member", role: "user", accessExpiresAt: null },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

describe("screen share router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLiveKitScreenShareRoom).mockResolvedValue(undefined as never);
    vi.mocked(createLiveKitScreenShareToken).mockResolvedValue({ serverUrl: "wss://livekit.example", token: "scoped-token" } as any);
  });

  it("creates a separate 11-person LiveKit room and mints a host-only token after membership authorization", async () => {
    vi.mocked(db.createScreenShareSession).mockResolvedValue(session as any);

    await expect(callerFor(7).screenShares.create({ conversationId: 18 })).resolves.toMatchObject({
      session: { id: sessionId },
      connection: { token: "scoped-token" },
    });
    expect(db.createScreenShareSession).toHaveBeenCalledWith(18, 7);
    expect(createLiveKitScreenShareRoom).toHaveBeenCalledWith(session.room);
    expect(createLiveKitScreenShareToken).toHaveBeenCalledWith(expect.objectContaining({ room: session.room, identity: "user-7", role: "host" }));
  });

  it("does not create a room or mint a host token when the caller is not an authorized conversation member", async () => {
    vi.mocked(db.createScreenShareSession).mockRejectedValue(new Error("Bạn không có quyền chia sẻ trong hội thoại này."));

    await expect(callerFor(44).screenShares.create({ conversationId: 18 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createLiveKitScreenShareRoom).not.toHaveBeenCalled();
    expect(createLiveKitScreenShareToken).not.toHaveBeenCalled();
  });

  it("sends exactly one system invitation after a successfully published host activates the session", async () => {
    vi.mocked(db.activateScreenShareSession).mockResolvedValue({ session: { ...session, status: "live", startedAt: new Date() }, activatedNow: true } as any);
    vi.mocked(db.createMessage).mockResolvedValue({
      id: 109, conversationId: 18, senderId: 7, body: `chatpht:screen-share:${sessionId}`, contentType: "screen_share_invite", mediaMime: null, mediaName: null, mediaSize: null, mediaBatchId: null, mediaKey: null, replyToMessageId: null, recalledAt: null, recalledBy: null, createdAt: new Date(), reactions: [], recipientDeliveredAt: null, recipientReadAt: null,
    } as any);

    await expect(callerFor(7).screenShares.activate({ sessionId })).resolves.toMatchObject({ session: { status: "live" }, message: { contentType: "screen_share_invite" } });
    expect(db.activateScreenShareSession).toHaveBeenCalledWith(sessionId, 7);
    expect(db.createMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 18, senderId: 7, contentType: "screen_share_invite", body: `chatpht:screen-share:${sessionId}` }));
    expect(dispatchNewMessagePushNotifications).toHaveBeenCalledWith({ conversationId: 18, senderId: 7 });
  });

  it("does not duplicate the invitation when a host retries activation of an already-live session", async () => {
    vi.mocked(db.activateScreenShareSession).mockResolvedValue({ session: { ...session, status: "live", startedAt: new Date() }, activatedNow: false } as any);

    await expect(callerFor(7).screenShares.activate({ sessionId })).resolves.toMatchObject({ session: { status: "live" }, message: null });
    expect(db.createMessage).not.toHaveBeenCalled();
    expect(dispatchNewMessagePushNotifications).not.toHaveBeenCalled();
  });

  it("mints a viewer token only after the data layer confirms a live session and membership", async () => {
    vi.mocked(db.joinScreenShareSession).mockResolvedValue({ ...session, status: "live", startedAt: new Date() } as any);

    await expect(callerFor(9).screenShares.join({ sessionId })).resolves.toMatchObject({ session: { status: "live" }, connection: { token: "scoped-token" } });
    expect(db.joinScreenShareSession).toHaveBeenCalledWith(sessionId, 9);
    expect(createLiveKitScreenShareToken).toHaveBeenCalledWith(expect.objectContaining({ room: session.room, identity: "user-9", role: "viewer" }));
  });

  it("does not mint a viewer token when a session is starting, ended, expired, or the caller is not a member", async () => {
    vi.mocked(db.joinScreenShareSession).mockRejectedValue(new Error("Chia sẻ màn hình này không còn hoạt động."));

    await expect(callerFor(44).screenShares.join({ sessionId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createLiveKitScreenShareToken).not.toHaveBeenCalled();
  });

  it("delegates ending a screen session to the data layer, which enforces host ownership", async () => {
    vi.mocked(db.finishScreenShareSession).mockResolvedValue({ ...session, status: "ended", endedAt: new Date() } as any);

    await expect(callerFor(7).screenShares.end({ sessionId })).resolves.toMatchObject({ status: "ended" });
    expect(db.finishScreenShareSession).toHaveBeenCalledWith(sessionId, 7);
  });
});
