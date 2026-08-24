import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  listManagedUsers: vi.fn(),
  getStorageUsageSummary: vi.fn(),
  getAdminOperationalStats: vi.fn(),
  updateStorageQuotaSettings: vi.fn(),
  setUserAccessExpiry: vi.fn(),
  deleteManagedUser: vi.fn(),
}));

vi.mock("../server/media-cleanup", () => ({
  runMediaCleanup: vi.fn().mockResolvedValue({ cleanedCount: 0 }),
}));

vi.mock("../server/storage", () => ({
  storagePut: vi.fn(),
  storageCreateUploadUrl: vi.fn(),
  storageDelete: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));

import * as db from "../server/db";
import { appRouter } from "../server/routers";
import * as storage from "../server/storage";

function callerFor(role: "admin" | "user") {
  return appRouter.createCaller({
    user: { id: role === "admin" ? 1 : 7, role, accessExpiresAt: null },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

describe("admin access controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses every management action from a standard account", async () => {
    await expect(callerFor("user").admin.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("user").admin.storageSummary()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("user").admin.operationalStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.listManagedUsers).not.toHaveBeenCalled();
    expect(db.getStorageUsageSummary).not.toHaveBeenCalled();
    expect(db.getAdminOperationalStats).not.toHaveBeenCalled();
  });

  it("returns the read-only storage summary only to an administrator", async () => {
    vi.mocked(db.getStorageUsageSummary).mockResolvedValue({
      usedBytes: 823_319,
      mediaCount: 2,
      quotaGb: 200,
      quotaBytes: 200 * 1024 * 1024 * 1024,
      unlimited: false,
      lastCleanupAt: null,
      recentMedia: [],
    });

    await expect(callerFor("admin").admin.storageSummary()).resolves.toMatchObject({ usedBytes: 823_319, mediaCount: 2 });
    expect(db.getStorageUsageSummary).toHaveBeenCalledTimes(1);
  });

  it("returns operational call and group counts only to an administrator", async () => {
    vi.mocked(db.getAdminOperationalStats).mockResolvedValue({
      storage: { usedBytes: 0, mediaCount: 0, quotaGb: 200, quotaBytes: 200 * 1024 * 1024 * 1024, unlimited: false, lastCleanupAt: null, recentMedia: [] },
      groupsCreated: 4,
      callsToday: { p2p: 1 },
    });

    await expect(callerFor("admin").admin.operationalStats()).resolves.toMatchObject({ groupsCreated: 4, callsToday: { p2p: 1 } });
    expect(db.getAdminOperationalStats).toHaveBeenCalledTimes(1);
  });

  it("chỉ cho phép quản trị viên đổi quota trong các mức được hỗ trợ", async () => {
    vi.mocked(db.updateStorageQuotaSettings).mockResolvedValue({ quotaGb: 50, unlimited: false, scheduledTaskUid: null, lastCleanupAt: null });

    await expect(callerFor("user").admin.updateStorageQuota({ quotaGb: 50, unlimited: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("admin").admin.updateStorageQuota({ quotaGb: 50, unlimited: false })).resolves.toMatchObject({ quotaGb: 50, unlimited: false });
    expect(db.updateStorageQuotaSettings).toHaveBeenCalledWith({ quotaGb: 50, unlimited: false });
  });

  it("blocks an expired standard account before it can use protected features", async () => {
    vi.mocked(db.isUserAccessExpired).mockReturnValue(true);

    await expect(callerFor("user").profile.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("sets a user's access expiry from the requested number of days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00.000Z"));
    vi.mocked(db.setUserAccessExpiry).mockResolvedValue({ id: 7, username: "member" } as any);

    await expect(callerFor("admin").admin.setAccessDays({ userId: 7, days: 14 })).resolves.toMatchObject({ id: 7 });
    expect(db.setUserAccessExpiry).toHaveBeenCalledWith(7, new Date("2026-09-04T00:00:00.000Z"));
    vi.useRealTimers();
  });

  it("cleans owned media after an administrator deletes a standard account", async () => {
    vi.mocked(db.deleteManagedUser).mockResolvedValue({
      username: "member",
      mediaKeys: ["chatpht/7/photo.jpg", "chatpht/7/video.mp4"],
    });

    await expect(callerFor("admin").admin.deleteUser({ userId: 7 })).resolves.toEqual({ success: true, username: "member" });
    expect(storage.storageDelete).toHaveBeenCalledWith("chatpht/7/photo.jpg");
    expect(storage.storageDelete).toHaveBeenCalledWith("chatpht/7/video.mp4");
  });
});
