import { describe, expect, it } from "vitest";

import { P2P_RING_TIMEOUT_MS } from "../server/db";

describe("P2P ringing timeout", () => {
  it("cho Android đủ thời gian để hiện cuộc gọi đến và người dùng cấp quyền", () => {
    expect(P2P_RING_TIMEOUT_MS).toBe(180_000);
  });
});
