import { describe, expect, it } from "vitest";

import { shouldRetryScreenSharePublication } from "../lib/livekit-screen-share-policy";

describe("LiveKit screen-share publication policy", () => {
  it("retries the server acknowledgement timeout exactly once", () => {
    expect(shouldRetryScreenSharePublication(new Error("publication of local track timed out, no response from server"), 0)).toBe(true);
    expect(shouldRetryScreenSharePublication(new Error("publication of local track timed out, no response from server"), 1)).toBe(false);
  });

  it("does not retry denied Android MediaProjection consent", () => {
    expect(shouldRetryScreenSharePublication(new Error("User denied MediaProjection"), 0)).toBe(false);
  });
});
