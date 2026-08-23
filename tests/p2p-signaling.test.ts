import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  createP2pSignal: vi.fn(),
  drainP2pSignals: vi.fn(),
  activateLiveKitFallback: vi.fn(),
  authorizeP2pIceConfig: vi.fn(),
}));

vi.mock("../server/call-token", () => ({
  createLiveKitCallToken: vi.fn(),
}));

import * as db from "../server/db";
import { createLiveKitCallToken } from "../server/call-token";
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
    vi.mocked(createLiveKitCallToken).mockResolvedValue({ serverUrl: "wss://livekit.example", token: "fallback-token" } as any);
  });

  it("passes an authenticated caller signal to the data layer without exposing another recipient", async () => {
    vi.mocked(db.createP2pSignal).mockResolvedValue({ id: 11, recipientId: 9 } as any);

    await expect(callerFor(7).calls.p2pSignal.send({ callId, type: "offer", payload: "sdp-offer" })).resolves.toEqual({ id: 11, recipientId: 9 });
    expect(db.createP2pSignal).toHaveBeenCalledWith({ callId, type: "offer", payload: "sdp-offer", senderId: 7 });
  });

  it("returns only the authorized member's drained signal queue", async () => {
    const queue = [{ id: 12, senderId: 7, type: "ice", payload: "candidate", createdAt: new Date("2026-08-23T00:00:00.000Z") }];
    vi.mocked(db.drainP2pSignals).mockResolvedValue(queue as any);

    await expect(callerFor(9).calls.p2pSignal.drain({ callId })).resolves.toEqual(queue);
    expect(db.drainP2pSignals).toHaveBeenCalledWith(callId, 9);
  });

  it("returns ICE configuration only after the data layer authorizes the direct-call member", async () => {
    vi.mocked(db.authorizeP2pIceConfig).mockResolvedValue(undefined);

    await expect(callerFor(9).calls.p2pIceConfig({ callId })).resolves.toMatchObject({
      hasTurn: false,
      iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
    });
    expect(db.authorizeP2pIceConfig).toHaveBeenCalledWith(callId, 9);
  });

  it("rejects ICE configuration when the caller is not a member of the direct P2P session", async () => {
    vi.mocked(db.authorizeP2pIceConfig).mockRejectedValue(new Error("Bạn không có quyền tham gia cuộc gọi này."));

    await expect(callerFor(12).calls.p2pIceConfig({ callId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("mints a LiveKit token only after the data layer authorizes a fallback", async () => {
    vi.mocked(db.activateLiveKitFallback).mockResolvedValue({ id: callId, room: "chatpht-call-45e72ca3", provider: "livekit" } as any);

    await expect(callerFor(9).calls.fallbackToLiveKit({ callId })).resolves.toMatchObject({ call: { provider: "livekit" }, session: { token: "fallback-token" } });
    expect(db.activateLiveKitFallback).toHaveBeenCalledWith(callId, 9);
    expect(createLiveKitCallToken).toHaveBeenCalledWith(expect.objectContaining({ room: "chatpht-call-45e72ca3", identity: "user-9" }));
  });

  it("does not mint a fallback token when the P2P session is unauthorized or closed", async () => {
    vi.mocked(db.activateLiveKitFallback).mockRejectedValue(new Error("Bạn không có quyền chuyển đường truyền cuộc gọi này."));

    await expect(callerFor(12).calls.fallbackToLiveKit({ callId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createLiveKitCallToken).not.toHaveBeenCalled();
  });
});
