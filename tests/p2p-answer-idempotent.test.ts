import { describe, expect, it } from "vitest";

import { isIdempotentP2pAnswerStatus } from "../server/db";

describe("P2P answer retry contract", () => {
  it("treats a repeated recipient answer for an active direct call as safe", () => {
    expect(isIdempotentP2pAnswerStatus("active")).toBe(true);
    expect(isIdempotentP2pAnswerStatus("ringing")).toBe(false);
    expect(isIdempotentP2pAnswerStatus("ended")).toBe(false);
  });
});
