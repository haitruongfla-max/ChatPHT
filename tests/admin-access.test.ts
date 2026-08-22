import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  listManagedUsers: vi.fn(),
  getStorageUsageSummary: vi.fn(),
  setUserAccessExpiry: vi.fn(),
  deleteManagedUser: vi.fn(),
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
    expect(db.listManagedUsers).not.toHaveBeenCalled();
    expect(db.getStorageUsageSummary).not.toHaveBeenCalled();
  });

  it("returns the read-only storage summary only to an administrator", async () => {
    vi.mocked(db.getStorageUsageSummary).mockResolvedValue({
      usedBytes: 823_319,
      mediaCount: 2,
      quotaBytes: 20 * 1024 * 1024 * 1024,
      recentMedia: [],
    });

    await expect(callerFor("admin").admin.storageSummary()).resolves.toMatchObject({ usedBytes: 823_319, mediaCount: 2 });
    expect(db.getStorageUsageSummary).toHaveBeenCalledTimes(1);
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
