import { describe, expect, it } from "vitest";

import {
  P2P_TURN_TTL_SECONDS,
  createTurnCredential,
  createTurnUsername,
  getP2pIceConfiguration,
  getTurnCredential,
  parseTurnUrls,
} from "../server/p2p-turn";
import { ENV } from "../server/_core/env";

const callId = "45e72ca3-6109-4cf2-b861-6d565bc470a3";
const now = 1_800_000_000_000;
const sharedSecret = "turn-test-shared-secret";

describe("P2P TURN credentials", () => {
  it("preserves UDP, TCP and TLS-443 TURN URLs while discarding malformed relay values", () => {
    expect(parseTurnUrls([
      "turn:relay.chatpht.example:3478?transport=udp",
      "turn:relay.chatpht.example:3478?transport=tcp",
      "turns:relay.chatpht.example:443?transport=tcp",
      "https://not-a-turn-server.example",
      "turn:bad host.example:3478",
    ].join(","))).toEqual([
      "turn:relay.chatpht.example:3478?transport=udp",
      "turn:relay.chatpht.example:3478?transport=tcp",
      "turns:relay.chatpht.example:443?transport=tcp",
    ]);
  });

  it("creates a 24-hour Coturn REST credential with an HMAC-SHA1 value", () => {
    const expiresAt = Math.floor(now / 1000) + P2P_TURN_TTL_SECONDS;
    const username = createTurnUsername(7, callId, expiresAt);
    const turn = getTurnCredential({
      turnUrls: "turn:relay.chatpht.example:3478?transport=udp,turns:relay.chatpht.example:443?transport=tcp",
      turnSharedSecret: sharedSecret,
      turnUsername: "legacy-user",
      turnCredential: "legacy-credential",
    }, { userId: 7, callId }, now);

    expect(username).toBe(`${expiresAt}:user-7:call-${callId}`);
    expect(turn).toEqual({
      urls: ["turn:relay.chatpht.example:3478?transport=udp", "turns:relay.chatpht.example:443?transport=tcp"],
      username,
      credential: createTurnCredential(sharedSecret, username),
      expiresAt,
      authMode: "shared-secret",
    });
  });

  it("uses the static credential only when no shared secret is configured", () => {
    const configuration = getP2pIceConfiguration({
      turnUrls: "turns:relay.chatpht.example:443?transport=tcp",
      turnSharedSecret: "",
      turnUsername: "legacy-user",
      turnCredential: "legacy-credential",
    }, { userId: 7, callId }, now);

    expect(configuration).toMatchObject({
      hasTurn: true,
      turn: { authMode: "static", username: "legacy-user", expiresAt: 0 },
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
        { urls: ["turns:relay.chatpht.example:443?transport=tcp"], username: "legacy-user", credential: "legacy-credential" },
      ],
    });
  });

  it("does not return a TURN credential when relay URLs or credentials are unavailable", () => {
    expect(getP2pIceConfiguration({
      turnUrls: "turn:relay.chatpht.example:3478?transport=sctp",
      turnSharedSecret: "",
      turnUsername: "",
      turnCredential: "",
    }, { userId: 7, callId }, now)).toEqual({
      hasTurn: false,
      turn: null,
      iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
    });
  });

  it.runIf(Boolean(ENV.p2pTurnSharedSecret && ENV.p2pTurnUrls))("validates the configured shared secret through a derived credential without logging it", () => {
    const turn = getTurnCredential({
      turnUrls: ENV.p2pTurnUrls,
      turnSharedSecret: ENV.p2pTurnSharedSecret,
      turnUsername: ENV.p2pTurnUsername,
      turnCredential: ENV.p2pTurnCredential,
    }, { userId: 7, callId }, now);

    expect(turn).toMatchObject({ authMode: "shared-secret", expiresAt: Math.floor(now / 1000) + P2P_TURN_TTL_SECONDS });
    expect(turn?.credential).toBe(createTurnCredential(ENV.p2pTurnSharedSecret, turn!.username));
  });
});
