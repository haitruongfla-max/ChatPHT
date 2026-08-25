import { describe, expect, it } from "vitest";

import { DIRECT_STUN_FALLBACK, resolveP2pIceServers } from "../lib/p2p-ice-bootstrap";

describe("P2P ICE bootstrap", () => {
  it("uses authenticated server ICE immediately when it is already available", async () => {
    const cached = [{ urls: ["turns:relay.example:443"], username: "temporary", credential: "protected" }];
    const result = await resolveP2pIceServers(cached, async () => undefined);

    expect(result).toEqual({ iceServers: cached, source: "server" });
  });

  it("falls back to direct STUN when an ICE configuration request is slow", async () => {
    const result = await resolveP2pIceServers(
      undefined,
      () => new Promise(() => undefined),
      1,
    );

    expect(result).toEqual({ iceServers: DIRECT_STUN_FALLBACK, source: "fallback" });
  });

  it("falls back to direct STUN when an ICE configuration request rejects", async () => {
    const result = await resolveP2pIceServers(
      undefined,
      async () => { throw new Error("network unavailable"); },
    );

    expect(result).toEqual({ iceServers: DIRECT_STUN_FALLBACK, source: "fallback" });
  });
});
