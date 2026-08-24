import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const callScreen = readFileSync(resolve(process.cwd(), "app/call.native.tsx"), "utf8");

describe("P2P call screen guards", () => {
  it("does not mark the caller connected before WebRTC reports an ICE connection", () => {
    expect(callScreen).toContain('setConnected(state === "connected")');
    expect(callScreen).not.toContain("else setConnected(true);");
    expect(callScreen).toContain('state === "recovering"');
  });

  it("blocks duplicate answer mutations and screen sharing before real P2P connectivity", () => {
    expect(callScreen).toContain("answerInFlight.current");
    expect(callScreen).toContain("!p2p.isConnected()");
  });
});
