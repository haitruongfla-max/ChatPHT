import { describe, expect, it } from "vitest";
import { runMediaUploadQueue } from "../lib/media-upload-queue";

describe("media upload queue", () => {
  it("limits simultaneous uploads and reports completed files", async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ id: String(index), size: 10 }));
    let active = 0;
    let highestActive = 0;
    const states: Array<{ completed: number; total: number; percent: number }> = [];

    await runMediaUploadQueue(
      items,
      async (_item, report) => {
        active += 1;
        highestActive = Math.max(highestActive, active);
        report(50);
        await Promise.resolve();
        report(100);
        active -= 1;
      },
      (progress) => states.push(progress),
    );

    expect(highestActive).toBeLessThanOrEqual(3);
    expect(states.at(-1)).toEqual({ completed: 5, total: 5, percent: 100 });
  });
});
