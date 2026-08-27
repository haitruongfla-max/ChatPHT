import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  listConversationRecipientDevices: vi.fn(),
  getUserById: vi.fn(),
  toPublicProfile: vi.fn(),
  disablePushDevice: vi.fn(),
}));

vi.mock("../server/fcm-credentials", () => ({
  getFcmAccessToken: vi.fn().mockResolvedValue({ accessToken: "short-lived-access-token", expiresIn: 3_600, projectId: "chatpht-test" }),
}));

import * as db from "../server/db";
import {
  buildIncomingCallFcmMessage,
  buildNewMessagePushPayload,
  dispatchIncomingCallPush,
  dispatchNewMessagePushNotifications,
  normalizePushPreview,
} from "../server/push";

describe("private chat push dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: [{ status: "ok" }] }) }));
    vi.mocked(db.getUserById).mockResolvedValue({ id: 7, name: "  Hải   Trường ", username: "hai" } as any);
    vi.mocked(db.toPublicProfile).mockReturnValue({ displayName: "  Hải   Trường " } as any);
  });

  it("uses the sender name and a normalized text preview at normal priority", () => {
    expect(buildNewMessagePushPayload({
      token: "ExponentPushToken[device-a]",
      conversationId: 18,
      senderDisplayName: "  Hải   Trường ",
      preview: " alo\n  bạn ơi ",
    })).toEqual({
      to: "ExponentPushToken[device-a]",
      title: "Hải Trường",
      body: "alo bạn ơi",
      sound: "default",
      priority: "normal",
      ttl: 86_400,
      channelId: "messages",
      data: { conversationId: 18 },
    });
    expect(normalizePushPreview("a".repeat(200))).toHaveLength(180);
  });

  it("sends only valid recipient device tokens and deduplicates them", async () => {
    vi.mocked(db.listConversationRecipientDevices).mockResolvedValue([
      { token: "ExponentPushToken[recipient-device]", platform: "android", transport: "expo" },
      { token: "ExponentPushToken[recipient-device]", platform: "android", transport: "expo" },
      { token: "fcm-direct-device", platform: "android", transport: "fcm" },
      { token: "invalid-token", platform: "ios", transport: "expo" },
    ] as any);

    await expect(dispatchNewMessagePushNotifications({ conversationId: 18, senderId: 7, preview: "alo bạn ơi" })).resolves.toEqual({ sent: 1 });
    expect(fetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify([buildNewMessagePushPayload({
          token: "ExponentPushToken[recipient-device]",
          conversationId: 18,
          senderDisplayName: "  Hải   Trường ",
          preview: "alo bạn ơi",
        })]),
      }),
    );
  });

  it("does not count a notification as sent when Expo rejects its token", async () => {
    vi.mocked(db.listConversationRecipientDevices).mockResolvedValue([
      { token: "ExponentPushToken[expired-device]", platform: "android", transport: "expo" },
    ] as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
    }));

    await expect(dispatchNewMessagePushNotifications({ conversationId: 18, senderId: 7, preview: "Đã gửi ảnh" })).resolves.toEqual({ sent: 0 });
  });

  it("builds a data-only, short-lived high-priority call payload without signaling or credentials", () => {
    const message = buildIncomingCallFcmMessage("fcm-device", {
      callId: "call-abcdefgh",
      conversationId: 18,
      callerId: 7,
      callerDisplayName: "Hải Trường",
      mode: "video",
      expiresAt: new Date(1_000_000),
    }, 990_000);

    expect(message).toEqual({
      token: "fcm-device",
      data: {
        eventType: "incoming_call",
        callId: "call-abcdefgh",
        conversationId: "18",
        callerId: "7",
        callerName: "Hải Trường",
        mode: "video",
        expiresAt: "1000000",
      },
      android: { priority: "HIGH", ttl: "10s", direct_boot_ok: true },
    });
    expect(JSON.stringify(message?.data)).not.toMatch(/sdp|ice|candidate|turn|bearer|credential/i);
    expect(buildIncomingCallFcmMessage("fcm-device", {
      callId: "call-expired", conversationId: 18, callerId: 7, callerDisplayName: "Hải Trường", mode: "voice", expiresAt: new Date(500),
    }, 500)).toBeNull();
  });

  it("routes a ringing call only to Android FCM tokens", async () => {
    vi.mocked(db.listConversationRecipientDevices).mockResolvedValue([
      { token: "fcm-direct-device", platform: "android", transport: "fcm" },
      { token: "ExponentPushToken[expo-device]", platform: "android", transport: "expo" },
      { token: "ios-fcm-device", platform: "ios", transport: "fcm" },
    ] as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ name: "ok" }) }));

    await expect(dispatchIncomingCallPush({
      callId: "call-abcdefgh", conversationId: 18, callerId: 7, callerDisplayName: "Hải Trường", mode: "voice", expiresAt: new Date(Date.now() + 20_000),
    })).resolves.toEqual({ sent: 1 });
    expect(fetch).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/v1/projects/chatpht-test/messages:send",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer short-lived-access-token" }) }),
    );
  });
});
