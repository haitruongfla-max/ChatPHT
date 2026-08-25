import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  listConversationRecipientDevices: vi.fn(),
}));

import * as db from "../server/db";
import { buildNewMessagePushPayload, dispatchNewMessagePushNotifications } from "../server/push";

describe("private chat push dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: [{ status: "ok" }] }) }));
  });

  it("builds a notification without exposing sender identity or message content", () => {
    expect(buildNewMessagePushPayload("ExponentPushToken[device-a]", 18)).toEqual({
      to: "ExponentPushToken[device-a]",
      title: "ChatPHT",
      body: "Bạn có tin nhắn mới",
      sound: "default",
      priority: "high",
      ttl: 86_400,
      channelId: "messages",
      data: { conversationId: 18 },
    });
  });

  it("sends only valid recipient device tokens and deduplicates them", async () => {
    vi.mocked(db.listConversationRecipientDevices).mockResolvedValue([
      { token: "ExponentPushToken[recipient-device]", platform: "android" },
      { token: "ExponentPushToken[recipient-device]", platform: "android" },
      { token: "invalid-token", platform: "ios" },
    ] as any);

    await expect(dispatchNewMessagePushNotifications({ conversationId: 18, senderId: 7 })).resolves.toEqual({ sent: 1 });
    expect(fetch).toHaveBeenCalledWith(
      "https://exp.host/--/api/v2/push/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify([buildNewMessagePushPayload("ExponentPushToken[recipient-device]", 18)]),
      }),
    );
  });

  it("does not count a notification as sent when Expo rejects its token", async () => {
    vi.mocked(db.listConversationRecipientDevices).mockResolvedValue([
      { token: "ExponentPushToken[expired-device]", platform: "android" },
    ] as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
    }));

    await expect(dispatchNewMessagePushNotifications({ conversationId: 18, senderId: 7 })).resolves.toEqual({ sent: 0 });
  });
});
