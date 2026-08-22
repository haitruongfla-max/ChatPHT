import { describe, expect, it } from "vitest";

import { selectMediaForCleanup } from "../lib/media-cleanup-policy";

const GIB = 1024 * 1024 * 1024;
const now = new Date("2026-08-22T02:00:00.000Z");

describe("media cleanup policy", () => {
  it("always selects media over 30 days old while keeping the message itself outside this policy", () => {
    const selected = selectMediaForCleanup({ quotaBytes: 200 * GIB, now, media: [
      { id: 1, mediaSize: 1, createdAt: new Date("2026-07-01T00:00:00.000Z") },
      { id: 2, mediaSize: 1, createdAt: new Date("2026-08-20T00:00:00.000Z") },
    ] });
    expect(selected.map((item) => item.id)).toEqual([1]);
  });

  it("uses FIFO only after media exceeds 90 percent and returns it to 70 percent", () => {
    const selected = selectMediaForCleanup({ quotaBytes: 100 * GIB, now, media: [
      { id: 1, mediaSize: 15 * GIB, createdAt: new Date("2026-08-01T00:00:00.000Z") },
      { id: 2, mediaSize: 15 * GIB, createdAt: new Date("2026-08-05T00:00:00.000Z") },
      { id: 3, mediaSize: 62 * GIB, createdAt: new Date("2026-08-10T00:00:00.000Z") },
    ] });
    expect(selected.map((item) => item.id)).toEqual([1, 2]);
  });

  it("does not apply quota FIFO in unlimited mode", () => {
    const selected = selectMediaForCleanup({ quotaBytes: null, now, media: [
      { id: 1, mediaSize: 500 * GIB, createdAt: new Date("2026-08-21T00:00:00.000Z") },
    ] });
    expect(selected).toEqual([]);
  });
});
