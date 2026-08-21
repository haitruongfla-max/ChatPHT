import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isConversationMember: vi.fn(),
  createMessage: vi.fn(),
  listMessages: vi.fn(),
  hideConversationForUser: vi.fn(),
  recallMessage: vi.fn(),
  upsertPushDevice: vi.fn(),
  removePushDevice: vi.fn(),
  listConversationRecipientDevices: vi.fn().mockResolvedValue([]),
  toPublicProfile: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));

import * as db from "../server/db";
import { appRouter } from "../server/routers";
import * as storage from "../server/storage";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

const uploadInput = {
  conversationId: 18,
  filename: "summer photo.jpg",
  mimeType: "image/jpeg" as const,
  base64: "aGVsbG8=",
};

describe("chat media access controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an attachment when the user is not a conversation member", async () => {
    vi.mocked(db.isConversationMember).mockResolvedValue(false);

    await expect(callerFor().messages.upload(uploadInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage.storagePut).not.toHaveBeenCalled();
    expect(db.createMessage).not.toHaveBeenCalled();
  });

  it("rejects malformed base64 before any storage write", async () => {
    vi.mocked(db.isConversationMember).mockResolvedValue(true);

    await expect(callerFor().messages.upload({ ...uploadInput, base64: "not valid base64!" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storage.storagePut).not.toHaveBeenCalled();
  });

  it("sanitizes a permitted attachment name and returns a temporary media URL", async () => {
    vi.mocked(db.isConversationMember).mockResolvedValue(true);
    vi.mocked(storage.storagePut).mockResolvedValue({ key: "swiftchat/18/7/example.jpg" } as any);
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://temporary.example/media.jpg");
    vi.mocked(db.createMessage).mockResolvedValue({
      id: 55,
      conversationId: 18,
      senderId: 7,
      body: null,
      contentType: "image",
      mediaKey: "swiftchat/18/7/example.jpg",
      mediaMime: "image/jpeg",
      mediaName: "summer_photo.jpg",
      mediaSize: 5,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    } as any);

    await expect(callerFor().messages.upload(uploadInput)).resolves.toMatchObject({
      id: 55,
      contentType: "image",
      mediaUrl: "https://temporary.example/media.jpg",
    });
    expect(storage.storagePut).toHaveBeenCalledWith(expect.stringContaining("summer_photo.jpg"), expect.any(Buffer), "image/jpeg");
  });

  it("hides a conversation only for the requesting account", async () => {
    vi.mocked(db.hideConversationForUser).mockResolvedValue(undefined);

    await expect(callerFor(7).conversations.remove({ conversationId: 18 })).resolves.toEqual({ success: true });
    expect(db.hideConversationForUser).toHaveBeenCalledWith(18, 7);
  });

  it("returns a recalled marker without issuing a new media URL", async () => {
    vi.mocked(db.recallMessage).mockResolvedValue({
      id: 55,
      conversationId: 18,
      senderId: 7,
      body: null,
      contentType: "image",
      mediaKey: null,
      mediaMime: null,
      mediaName: null,
      mediaSize: null,
      recalledAt: new Date("2026-08-21T00:05:00.000Z"),
      recalledBy: 7,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    } as any);

    await expect(callerFor(7).messages.recall({ messageId: 55 })).resolves.toMatchObject({
      id: 55,
      recalledBy: 7,
      mediaUrl: null,
    });
    expect(db.recallMessage).toHaveBeenCalledWith(55, 7);
  });

  it("only registers a valid device token against the signed-in account", async () => {
    vi.mocked(db.upsertPushDevice).mockResolvedValue(undefined);

    await expect(
      callerFor(7).notifications.registerDevice({
        token: "ExponentPushToken[private-device-token]",
        platform: "android",
      }),
    ).resolves.toEqual({ success: true });
    expect(db.upsertPushDevice).toHaveBeenCalledWith({
      userId: 7,
      token: "ExponentPushToken[private-device-token]",
      platform: "android",
    });
  });
});
