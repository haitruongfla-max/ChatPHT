import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn(), createSessionToken: vi.fn() },
}));

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  findAuthorizedConversationMedia: vi.fn(),
  findAuthorizedWallpaper: vi.fn(),
  findAuthorizedAvatar: vi.fn(),
}));

vi.mock("../server/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/storage")>();
  return { ...actual, storageGetSignedUrl: vi.fn() };
});

import { sdk } from "../server/_core/sdk";
import * as db from "../server/db";
import { createMediaAccessUrl, MEDIA_ACCESS_TTL_MS, mediaDownloadHandler } from "../server/media-access";
import { createOpaqueStorageKey, storageGetSignedUrl } from "../server/storage";

function response() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { mediaKey: Buffer.from("chatpht/media/10/7/a1b2c3d4.jpg").toString("base64url") },
    query: {},
    headers: {},
    protocol: "https",
    ...overrides,
  };
}

describe("media download security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("trả 403 trước khi gọi xác thực khi thiếu capability JWT, kể cả khi chỉ có cookie phiên", async () => {
    const res = response();
    await mediaDownloadHandler(request({ headers: { cookie: "session=regular-session" } }) as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "media-access-denied" });
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("từ chối người có JWT nhưng không là thành viên cuộc trò chuyện", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ id: 9, openId: "local:outside", isCron: false, isMediaAccessToken: true } as any);
    vi.mocked(db.findAuthorizedConversationMedia).mockResolvedValue(undefined);
    vi.mocked(db.findAuthorizedWallpaper).mockResolvedValue(undefined);
    vi.mocked(db.findAuthorizedAvatar).mockResolvedValue(undefined);
    const res = response();

    await mediaDownloadHandler(request({ query: { access_token: "short-lived-token" } }) as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("chỉ lấy object sau khi JWT và quyền hội thoại đều hợp lệ", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ id: 7, openId: "local:member", isCron: false, isMediaAccessToken: true } as any);
    vi.mocked(db.findAuthorizedConversationMedia).mockResolvedValue({ mediaMime: "image/jpeg" });
    vi.mocked(storageGetSignedUrl).mockResolvedValue("https://storage.example/private-object" as never);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as Response);
    const res = response();

    await mediaDownloadHandler(request({ query: { access_token: "short-lived-token" } }) as any, res as any);

    expect(storageGetSignedUrl).toHaveBeenCalledWith("chatpht/media/10/7/a1b2c3d4.jpg");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, max-age=3600, immutable");
    expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("từ chối JWT phiên thông thường không có scope media", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ id: 7, openId: "local:member", isCron: false, isMediaAccessToken: false } as any);
    const res = response();

    await mediaDownloadHandler(request({ query: { access_token: "ordinary-session-token" } }) as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("cấp URL capability giới hạn một giờ và không gửi key thô trong đường dẫn", async () => {
    vi.mocked(sdk.createSessionToken).mockResolvedValue("signed-capability");
    const url = await createMediaAccessUrl(
      { headers: { host: "api.chatpht.example" }, protocol: "https" } as any,
      { openId: "local:7", name: "Người dùng" },
      "chatpht/media/10/7/random-object.jpg",
    );

    expect(sdk.createSessionToken).toHaveBeenCalledWith("local:7", expect.objectContaining({ scope: "media", expiresInMs: MEDIA_ACCESS_TTL_MS }));
    expect(url).toContain("/api/media/");
    expect(url).toContain("access_token=signed-capability");
    expect(url).not.toContain("chatpht/media/10/7/random-object.jpg");
  });

  it("tạo khóa object không bao gồm tên gốc", () => {
    const key = createOpaqueStorageKey("chatpht/media/10/7", "jpg");
    expect(key).toMatch(/^chatpht\/media\/10\/7\/[a-f0-9]{32}\.jpg$/);
    expect(key).not.toContain("anh-ky-niem.png");
  });
});
