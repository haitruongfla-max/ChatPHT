import { describe, expect, it } from "vitest";

import { STORAGE_QUOTA_BYTES, formatStorageGb, storageUsagePercent } from "../lib/storage-usage";

describe("storage usage presentation", () => {
  it("formats the current small media total in Vietnamese GB", () => {
    expect(formatStorageGb(823_319)).toBe("0,0008");
  });

  it("keeps a 20 GiB quota as 100 percent at the configured capacity", () => {
    expect(storageUsagePercent(STORAGE_QUOTA_BYTES)).toBe(100);
    expect(storageUsagePercent(STORAGE_QUOTA_BYTES * 2)).toBe(100);
  });
});
