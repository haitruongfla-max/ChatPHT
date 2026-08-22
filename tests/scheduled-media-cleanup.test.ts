import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));

vi.mock("../server/db", () => ({
  getStorageQuotaSettings: vi.fn(),
}));

vi.mock("../server/media-cleanup", () => ({
  runMediaCleanup: vi.fn(),
}));

import { sdk } from "../server/_core/sdk";
import * as db from "../server/db";
import { runMediaCleanup } from "../server/media-cleanup";
import { scheduledMediaCleanupHandler } from "../server/scheduled-media-cleanup";

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("scheduled media cleanup endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("từ chối yêu cầu không phải cron hoặc có mã tác vụ chưa đăng ký", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: false, taskUid: undefined } as any);
    vi.mocked(db.getStorageQuotaSettings).mockResolvedValue({ quotaGb: 200, unlimited: false, scheduledTaskUid: "stored-task", lastCleanupAt: null });
    const res = response();

    await scheduledMediaCleanupHandler({ originalUrl: "/api/scheduled/media-cleanup" } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "cron-only-or-unregistered-task" });
    expect(runMediaCleanup).not.toHaveBeenCalled();
  });

  it("chỉ chạy tác vụ đã được lưu và trả lại kết quả dọn", async () => {
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "stored-task" } as any);
    vi.mocked(db.getStorageQuotaSettings).mockResolvedValue({ quotaGb: 200, unlimited: false, scheduledTaskUid: "stored-task", lastCleanupAt: null });
    vi.mocked(runMediaCleanup).mockResolvedValue({ cleanedCount: 2, cleanedBytes: 1024, quotaBytes: 200, unlimited: false });
    const res = response();

    await scheduledMediaCleanupHandler({ originalUrl: "/api/scheduled/media-cleanup" } as any, res as any);

    expect(runMediaCleanup).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ ok: true, cleanedCount: 2, cleanedBytes: 1024, quotaBytes: 200, unlimited: false });
  });

  it("trả lỗi JSON có ngữ cảnh để nền tảng có thể điều tra và thử lại", async () => {
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(new Error("invalid cron session"));
    const res = response();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await scheduledMediaCleanupHandler({ originalUrl: "/api/scheduled/media-cleanup" } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(errorLog).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      ok: false,
      error: "invalid cron session",
      context: { url: "/api/scheduled/media-cleanup", taskUid: null },
      timestamp: expect.any(String),
    }));
    errorLog.mockRestore();
  });
});
