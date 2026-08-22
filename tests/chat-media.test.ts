import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  isConversationMember: vi.fn(),
  createMessage: vi.fn(),
  listMessages: vi.fn(),
  hideConversationForUser: vi.fn(),
  clearConversationContent: vi.fn(),
  recallMessage: vi.fn(),
  toggleMessageReaction: vi.fn(),
  markAllConversationsDelivered: vi.fn(),
  markConversationRead: vi.fn(),
  setConversationTyping: vi.fn(),
  getConversationTypingStatus: vi.fn(),
  getConversationWallpaperKey: vi.fn(),
  setConversationWallpaperKey: vi.fn(),
  upsertPushDevice: vi.fn(),
  removePushDevice: vi.fn(),
  getStorageUsageSummary: vi.fn(),
  listConversationRecipientDevices: vi.fn().mockResolvedValue([]),
  toPublicProfile: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storagePut: vi.fn(),
  storageCreateUploadUrl: vi.fn(),
  storageDelete: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  createOpaqueStorageKey: vi.fn((prefix: string, extension: string) => `${prefix}/opaque-object.${extension}`),
}));

vi.mock("../server/media-access", () => ({
  createMediaAccessUrl: vi.fn(() => "https://api.example/api/media/capability?access_token=short-lived"),
}));

import * as db from "../server/db";
import { appRouter } from "../server/routers";
import * as storage from "../server/storage";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId, role: "user", accessExpiresAt: null },
    req: { headers: { host: "api.example" }, protocol: "https" },
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
    vi.mocked(storage.storagePut).mockResolvedValue({ key: "chatpht/media/18/7/opaque-object.jpg" } as any);
    vi.mocked(db.createMessage).mockResolvedValue({
      id: 55,
      conversationId: 18,
      senderId: 7,
      body: null,
      contentType: "image",
      mediaKey: "chatpht/media/18/7/opaque-object.jpg",
      mediaMime: "image/jpeg",
      mediaName: "summer_photo.jpg",
      mediaSize: 5,
      createdAt: new Date("2026-08-21T00:00:00.000Z"),
    } as any);

    await expect(callerFor().messages.upload(uploadInput)).resolves.toMatchObject({
      id: 55,
      contentType: "image",
      mediaUrl: "https://api.example/api/media/capability?access_token=short-lived",
      mediaCacheKey: "chat-media-55",
    });
    expect(storage.storagePut).toHaveBeenCalledWith("chatpht/media/18/7/opaque-object.jpg", expect.any(Buffer), "image/jpeg");
  });

  it("hides a conversation only for the requesting account", async () => {
    vi.mocked(db.hideConversationForUser).mockResolvedValue(undefined);

    await expect(callerFor(7).conversations.remove({ conversationId: 18 })).resolves.toEqual({ success: true });
    expect(db.hideConversationForUser).toHaveBeenCalledWith(18, 7);
  });

  it("issues a private wallpaper upload URL only after validating the requesting member", async () => {
    vi.mocked(db.getConversationWallpaperKey).mockResolvedValue({ wallpaperKey: null, wallpaperOpacity: 60 });
    vi.mocked(storage.storageCreateUploadUrl).mockResolvedValue({
      key: "chatpht/wallpapers/7/18/opaque-object.jpg",
      uploadUrl: "https://upload.example/wallpaper.jpg",
    } as any);

    await expect(
      callerFor(7).conversations.requestWallpaperUpload({ conversationId: 18, mimeType: "image/jpeg", size: 1024 }),
    ).resolves.toMatchObject({ key: "chatpht/wallpapers/7/18/opaque-object.jpg" });
    expect(db.getConversationWallpaperKey).toHaveBeenCalledWith(18, 7);
  });

  it("accepts chat images up to 20 MiB and video up to 1 GiB", async () => {
    vi.mocked(db.isConversationMember).mockResolvedValue(true);
    vi.mocked(storage.storageCreateUploadUrl).mockResolvedValue({ key: "chatpht/media/18/7/opaque-object.jpg", uploadUrl: "https://upload.example/photo.jpg" } as any);

    await expect(callerFor(7).messages.requestMediaUpload({ conversationId: 18, filename: "photo.jpg", mimeType: "image/jpeg", size: 20 * 1024 * 1024 })).resolves.toMatchObject({ maximumSize: 20 * 1024 * 1024 });
    await expect(callerFor(7).messages.requestMediaUpload({ conversationId: 18, filename: "photo.jpg", mimeType: "image/jpeg", size: 20 * 1024 * 1024 + 1 })).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    await expect(callerFor(7).messages.requestMediaUpload({ conversationId: 18, filename: "clip.mp4", mimeType: "video/mp4", size: 1024 * 1024 * 1024 })).resolves.toMatchObject({ maximumSize: 1024 * 1024 * 1024 });
    await expect(callerFor(7).messages.requestMediaUpload({ conversationId: 18, filename: "clip.mp4", mimeType: "video/mp4", size: 1024 * 1024 * 1024 + 1 })).rejects.toMatchObject({ message: "Video tối đa 1GB." });
  });

  it("warns the client when a 50-file upload would take bounded storage near the FIFO threshold", async () => {
    vi.mocked(db.isConversationMember).mockResolvedValue(true);
    vi.mocked(db.getStorageUsageSummary).mockResolvedValue({
      usedBytes: 175 * 1024 * 1024 * 1024,
      quotaBytes: 200 * 1024 * 1024 * 1024,
      unlimited: false,
      mediaCount: 4,
      recentMedia: [],
    } as any);

    await expect(callerFor(7).messages.preflightMediaUpload({
      conversationId: 18,
      totalBytes: 6 * 1024 * 1024 * 1024,
      fileCount: 50,
    })).resolves.toMatchObject({ nearQuota: true, unlimited: false });
  });

  it("stores the shared album id when completing an authenticated direct upload", async () => {
    vi.mocked(db.isConversationMember).mockResolvedValue(true);
    vi.mocked(db.createMessage).mockResolvedValue({
      id: 88,
      conversationId: 18,
      senderId: 7,
      body: null,
      contentType: "image",
      mediaKey: "chatpht/media/18/7/opaque-object.jpg",
      mediaMime: "image/jpeg",
      mediaName: "photo.jpg",
      mediaSize: 100,
      mediaBatchId: "batch-1234567890-abcd",
      createdAt: new Date(),
    } as any);

    await expect(callerFor(7).messages.completeMediaUpload({
      conversationId: 18,
      key: "chatpht/media/18/7/opaque-object.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 100,
      mediaBatchId: "batch-1234567890-abcd",
    })).resolves.toMatchObject({ id: 88, mediaBatchId: "batch-1234567890-abcd" });
    expect(db.createMessage).toHaveBeenCalledWith(expect.objectContaining({ mediaBatchId: "batch-1234567890-abcd" }));
  });

  it("refuses a wallpaper key that belongs to another account", async () => {
    await expect(
      callerFor(7).conversations.setWallpaper({
        conversationId: 18,
        wallpaperKey: "chatpht/wallpapers/9/18/other-account-wallpaper.jpg",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.setConversationWallpaperKey).not.toHaveBeenCalled();
  });

  it("replaces only the caller's wallpaper and deletes the old private asset", async () => {
    const oldKey = "chatpht/wallpapers/7/18/old-wallpaper.jpg";
    const nextKey = "chatpht/wallpapers/7/18/new-wallpaper.jpg";
    vi.mocked(db.setConversationWallpaperKey).mockResolvedValue({ previousKey: oldKey, wallpaperKey: nextKey, wallpaperOpacity: 58 });
    vi.mocked(storage.storageDelete).mockResolvedValue(undefined);

    await expect(callerFor(7).conversations.setWallpaper({ conversationId: 18, wallpaperKey: nextKey, opacity: 58 })).resolves.toMatchObject({
      key: nextKey,
      url: "https://api.example/api/media/capability?access_token=short-lived",
      opacity: 58,
    });
    expect(db.setConversationWallpaperKey).toHaveBeenCalledWith(18, 7, nextKey, 58);
    expect(storage.storageDelete).toHaveBeenCalledWith(oldKey);
  });

  it("clears every message and media payload for both members through the authorized account", async () => {
    vi.mocked(db.clearConversationContent).mockResolvedValue({
      messagesDeleted: 3,
      mediaKeys: ["swiftchat/18/7/photo.jpg", "swiftchat/18/9/video.mp4"],
    });
    vi.mocked(storage.storageDelete).mockResolvedValue(undefined);

    await expect(callerFor(7).conversations.clearContent({ conversationId: 18 })).resolves.toEqual({
      success: true,
      clearedMessages: 3,
      clearedMedia: 2,
    });
    expect(db.clearConversationContent).toHaveBeenCalledWith(18, 7);
    expect(storage.storageDelete).toHaveBeenCalledTimes(2);
    expect(storage.storageDelete).toHaveBeenCalledWith("swiftchat/18/7/photo.jpg");
    expect(storage.storageDelete).toHaveBeenCalledWith("swiftchat/18/9/video.mp4");
  });

  it("does not expose clear-content to a caller that fails the membership check", async () => {
    vi.mocked(db.clearConversationContent).mockRejectedValue(new Error("Bạn không có quyền xóa sạch hội thoại này."));

    await expect(callerFor(11).conversations.clearContent({ conversationId: 18 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storage.storageDelete).not.toHaveBeenCalled();
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

  it("toggles an allowed emoji using the authenticated user identity", async () => {
    vi.mocked(db.toggleMessageReaction).mockResolvedValue({ conversationId: 18, active: true });

    await expect(callerFor(7).messages.toggleReaction({ messageId: 55, emoji: "❤️" })).resolves.toEqual({ conversationId: 18, active: true });
    expect(db.toggleMessageReaction).toHaveBeenCalledWith({ messageId: 55, emoji: "❤️", userId: 7 });
  });

  it("rejects unsupported reaction input before querying the database", async () => {
    await expect(callerFor(7).messages.toggleReaction({ messageId: 55, emoji: "🚀" as any })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.toggleMessageReaction).not.toHaveBeenCalled();
  });

  it("marks incoming conversations as delivered only for the active signed-in account", async () => {
    vi.mocked(db.markAllConversationsDelivered).mockResolvedValue(undefined);

    await expect(callerFor(7).conversations.markAllDelivered()).resolves.toEqual({ success: true });
    expect(db.markAllConversationsDelivered).toHaveBeenCalledWith(7);
  });

  it("marks a conversation read only for its active member", async () => {
    vi.mocked(db.markConversationRead).mockResolvedValue(undefined);

    await expect(callerFor(9).messages.markRead({ conversationId: 18 })).resolves.toEqual({ success: true });
    expect(db.markConversationRead).toHaveBeenCalledWith(18, 9);
  });

  it("updates the signed-in member's short-lived typing heartbeat", async () => {
    const typingUntil = new Date("2026-08-21T10:00:05.000Z");
    vi.mocked(db.setConversationTyping).mockResolvedValue({ typingUntil });

    await expect(callerFor(9).messages.setTyping({ conversationId: 18, isTyping: true })).resolves.toMatchObject({
      typingUntil,
    });
    expect(db.setConversationTyping).toHaveBeenCalledWith(18, 9, true);
  });

  it("returns only the other member's non-expired typing status", async () => {
    vi.mocked(db.getConversationTypingStatus).mockResolvedValue({
      isTyping: true,
      typingUntil: new Date("2026-08-21T10:00:05.000Z"),
    });

    await expect(callerFor(7).messages.typingStatus({ conversationId: 18 })).resolves.toMatchObject({
      isTyping: true,
    });
    expect(db.getConversationTypingStatus).toHaveBeenCalledWith(18, 7);
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
