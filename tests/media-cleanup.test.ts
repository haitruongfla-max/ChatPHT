import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  getStorageQuotaSettings: vi.fn(),
  listActiveMediaForCleanup: vi.fn(),
  markMessageMediaCleaned: vi.fn(),
  markStorageCleanupRan: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storageDelete: vi.fn(),
}));

import * as db from "../server/db";
import { runMediaCleanup } from "../server/media-cleanup";
import * as storage from "../server/storage";

describe("media cleanup service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("xóa object rồi mới đánh dấu media đã được dọn, vẫn giữ quyền retry khi lỗi", async () => {
    vi.mocked(db.getStorageQuotaSettings).mockResolvedValue({ quotaGb: 200, unlimited: false, scheduledTaskUid: "task-1", lastCleanupAt: null });
    vi.mocked(db.listActiveMediaForCleanup).mockResolvedValue([
      { id: 12, mediaKey: "chatpht/messages/12.jpg", mediaSize: 400, createdAt: new Date("2026-07-01T00:00:00.000Z") },
    ]);

    await expect(runMediaCleanup()).resolves.toMatchObject({ cleanedCount: 1, cleanedBytes: 400, unlimited: false });
    expect(storage.storageDelete).toHaveBeenCalledWith("chatpht/messages/12.jpg");
    expect(db.markMessageMediaCleaned).toHaveBeenCalledWith(12);
    expect(db.markStorageCleanupRan).toHaveBeenCalledTimes(1);
  });

  it("không đánh dấu bản ghi hoặc thời điểm chạy khi storage xóa thất bại", async () => {
    vi.mocked(db.getStorageQuotaSettings).mockResolvedValue({ quotaGb: 200, unlimited: false, scheduledTaskUid: "task-1", lastCleanupAt: null });
    vi.mocked(db.listActiveMediaForCleanup).mockResolvedValue([
      { id: 13, mediaKey: "chatpht/messages/13.mp4", mediaSize: 400, createdAt: new Date("2026-07-01T00:00:00.000Z") },
    ]);
    vi.mocked(storage.storageDelete).mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(runMediaCleanup()).rejects.toThrow("storage unavailable");
    expect(db.markMessageMediaCleaned).not.toHaveBeenCalled();
    expect(db.markStorageCleanupRan).not.toHaveBeenCalled();
  });
});
