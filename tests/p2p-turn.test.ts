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
      turnAuthMode: "auto",
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

  it("uses an explicitly selected static credential for OpenRelay even if an old shared secret exists", () => {
    const configuration = getP2pIceConfiguration({
      turnUrls: "turns:relay.chatpht.example:443?transport=tcp",
      turnAuthMode: "static",
      turnSharedSecret: sharedSecret,
      turnUsername: "openrelayproject",
      turnCredential: "openrelayproject",
    }, { userId: 7, callId }, now);

    expect(configuration).toMatchObject({
      hasTurn: true,
      turn: { authMode: "static", username: "openrelayproject", expiresAt: 0 },
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
        { urls: ["turns:relay.chatpht.example:443?transport=tcp"], username: "openrelayproject", credential: "openrelayproject" },
      ],
    });
  });

  it("does not return a TURN credential when relay URLs or credentials are unavailable", () => {
    expect(getP2pIceConfiguration({
      turnUrls: "turn:relay.chatpht.example:3478?transport=sctp",
      turnAuthMode: "auto",
      turnSharedSecret: "",
      turnUsername: "",
      turnCredential: "",
    }, { userId: 7, callId }, now)).toEqual({
      hasTurn: false,
      turn: null,
      iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
    });
  });

  it.runIf(Boolean(ENV.p2pTurnSharedSecret && ENV.p2pTurnUrls && ENV.p2pTurnAuthMode !== "static"))("validates the configured shared secret through a derived credential without logging it", () => {
    const turn = getTurnCredential({
      turnUrls: ENV.p2pTurnUrls,
      turnAuthMode: ENV.p2pTurnAuthMode,
      turnSharedSecret: ENV.p2pTurnSharedSecret,
      turnUsername: ENV.p2pTurnUsername,
      turnCredential: ENV.p2pTurnCredential,
    }, { userId: 7, callId }, now);

    expect(turn).toMatchObject({ authMode: "shared-secret", expiresAt: Math.floor(now / 1000) + P2P_TURN_TTL_SECONDS });
    expect(turn?.credential).toBe(createTurnCredential(ENV.p2pTurnSharedSecret, turn!.username));
  });

  it.runIf(Boolean(ENV.p2pTurnAuthMode === "static" && ENV.p2pTurnUrls && ENV.p2pTurnUsername && ENV.p2pTurnCredential))("validates the configured OpenRelay static mode without logging its credential", () => {
    const turn = getTurnCredential({
      turnUrls: ENV.p2pTurnUrls,
      turnAuthMode: ENV.p2pTurnAuthMode,
      turnSharedSecret: ENV.p2pTurnSharedSecret,
      turnUsername: ENV.p2pTurnUsername,
      turnCredential: ENV.p2pTurnCredential,
    }, { userId: 7, callId }, now);

    expect(turn).toMatchObject({ authMode: "static", username: ENV.p2pTurnUsername.trim(), expiresAt: 0 });
    expect(turn?.credential).toBe(ENV.p2pTurnCredential);
    expect(turn?.urls).toHaveLength(6);
  });
});
