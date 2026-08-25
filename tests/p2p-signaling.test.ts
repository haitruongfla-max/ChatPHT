import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  createCallSession: vi.fn(),
  createP2pSignal: vi.fn(),
  drainP2pSignals: vi.fn(),
  recordP2pTelemetry: vi.fn(),
  authorizeP2pIceConfig: vi.fn(),
  listConversationRecipientDevices: vi.fn(async () => []),
}));

vi.mock("../server/_core/realtime", () => ({
  emitConversationBackgroundUpdated: vi.fn(),
  emitP2pSignalAvailable: vi.fn(),
}));

import * as db from "../server/db";
import { emitP2pSignalAvailable } from "../server/_core/realtime";
import { appRouter } from "../server/routers";

const callId = "45e72ca3-6109-4cf2-b861-6d565bc470a3";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId, name: "Người dùng P2P", username: "p2p-member", role: "user", accessExpiresAt: null },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

describe("P2P signaling router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts only a direct P2P call without accepting a group or provider input", async () => {
    const call = { id: callId, conversationId: 33, kind: "video", provider: "p2p" };
    vi.mocked(db.createCallSession).mockResolvedValue(call as any);

    await expect(callerFor(7).calls.start({ conversationId: 33, kind: "video", p2pMode: "video" })).resolves.toEqual(call);
    expect(db.createCallSession).toHaveBeenCalledWith(33, 7, "video", "video");
  });

  it("does not expose group-call, Room token, or standalone screen-share procedures", () => {
    const procedures = (appRouter as any)._def.procedures as Record<string, unknown>;

    expect(procedures["calls.startGroup"]).toBeUndefined();
    expect(procedures["calls.joinGroup"]).toBeUndefined();
    expect(procedures["calls.livekitToken"]).toBeUndefined();
    expect(procedures["screenShares.create"]).toBeUndefined();
    expect(procedures["screenShares.join"]).toBeUndefined();
  });

  it("passes an authenticated caller signal to the data layer without exposing another recipient", async () => {
    vi.mocked(db.createP2pSignal).mockResolvedValue({ id: 11, recipientId: 9 } as any);

    await expect(callerFor(7).calls.p2pSignal.send({ callId, type: "offer", payload: "sdp-offer" })).resolves.toEqual({ id: 11, recipientId: 9 });
    expect(db.createP2pSignal).toHaveBeenCalledWith({ callId, type: "offer", payload: "sdp-offer", senderId: 7 });
    expect(emitP2pSignalAvailable).toHaveBeenCalledWith({
      recipientId: 9,
      callId,
      signalId: 11,
      type: "offer",
      createdAt: expect.any(String),
    });
    expect(emitP2pSignalAvailable).not.toHaveBeenCalledWith(expect.objectContaining({ payload: "sdp-offer" }));
  });

  it("relays screen-start and screen-stop only through the same authenticated P2P signal path", async () => {
    vi.mocked(db.createP2pSignal).mockResolvedValue({ id: 14, recipientId: 9 } as any);

    await expect(callerFor(7).calls.p2pSignal.send({ callId, type: "screen-start", payload: '{"trackId":"screen-1"}' })).resolves.toEqual({ id: 14, recipientId: 9 });
    await expect(callerFor(7).calls.p2pSignal.send({ callId, type: "screen-stop", payload: '{"trackId":"screen-1"}' })).resolves.toEqual({ id: 14, recipientId: 9 });
    expect(db.createP2pSignal).toHaveBeenNthCalledWith(1, { callId, type: "screen-start", payload: '{"trackId":"screen-1"}', senderId: 7 });
    expect(db.createP2pSignal).toHaveBeenNthCalledWith(2, { callId, type: "screen-stop", payload: '{"trackId":"screen-1"}', senderId: 7 });
  });

  it("returns only the authorized member's drained signal queue", async () => {
    const queue = [{ id: 12, senderId: 7, type: "ice", payload: "candidate", createdAt: new Date("2026-08-23T00:00:00.000Z") }];
    vi.mocked(db.drainP2pSignals).mockResolvedValue(queue as any);

    await expect(callerFor(9).calls.p2pSignal.drain({ callId })).resolves.toEqual(queue);
    expect(db.drainP2pSignals).toHaveBeenCalledWith(callId, 9);
  });

  it("records only an authenticated, allow-listed P2P diagnostic marker without any SDP, ICE or relay payload", async () => {
    vi.mocked(db.recordP2pTelemetry).mockResolvedValue({ accepted: true } as any);

    await expect(callerFor(9).calls.p2pTelemetry.record({ callId, event: "offer-created" })).resolves.toEqual({ accepted: true });
    expect(db.recordP2pTelemetry).toHaveBeenCalledWith({ callId, reporterId: 9, event: "offer-created" });

    await expect(callerFor(9).calls.p2pTelemetry.record({ callId, event: "sdp-offer" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns ICE configuration only after the data layer authorizes the direct-call member", async () => {
    vi.mocked(db.authorizeP2pIceConfig).mockResolvedValue(undefined);

    const configuration = await callerFor(9).calls.p2pIceConfig({ callId });
    expect(configuration.iceServers[0]).toEqual({ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] });
    expect(typeof configuration.hasTurn).toBe("boolean");
    if (configuration.hasTurn) expect(configuration.turn?.credential).toEqual(expect.any(String));
    expect(db.authorizeP2pIceConfig).toHaveBeenCalledWith(callId, 9);
  });

  it("exposes TURN credentials only after the direct-call member is authorized", async () => {
    vi.mocked(db.authorizeP2pIceConfig).mockResolvedValue(undefined);

    const credentials = await callerFor(9).calls.getTurnCredentials({ callId });
    expect(typeof credentials.hasTurn).toBe("boolean");
    if (credentials.hasTurn) expect(credentials.turn?.credential).toEqual(expect.any(String));
    else expect(credentials.turn).toBeNull();
    expect(db.authorizeP2pIceConfig).toHaveBeenCalledWith(callId, 9);
  });

  it("rejects ICE configuration when the caller is not a member of the direct P2P session", async () => {
    vi.mocked(db.authorizeP2pIceConfig).mockRejectedValue(new Error("Bạn không có quyền tham gia cuộc gọi này."));

    await expect(callerFor(12).calls.p2pIceConfig({ callId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

});
