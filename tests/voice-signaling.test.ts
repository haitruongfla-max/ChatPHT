import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  createVoiceCallSession: vi.fn(),
  getVoiceCallSession: vi.fn(),
  getIncomingVoiceCallSession: vi.fn(),
  answerVoiceCallSession: vi.fn(),
  finishVoiceCallSession: vi.fn(),
  createVoiceSignal: vi.fn(),
  drainVoiceSignals: vi.fn(),
}));
vi.mock("../server/voice-ice", () => ({
  getVoiceIceServers: vi.fn(() => [{ urls: "stun:stun.l.google.com:19302" }]),
}));

import { appRouter } from "../server/routers";
import * as db from "../server/db";
import { getVoiceIceServers } from "../server/voice-ice";
import type { TrpcContext } from "../server/_core/context";

const CALL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function callerFor(userId = 7) {
  const ctx = {
    user: {
      id: userId,
      openId: `voice-${userId}`,
      username: `voice_${userId}`,
      email: null,
      name: "Voice Tester",
      avatarKey: null,
      passwordHash: null,
      loginMethod: "password",
      role: "user",
      accessExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", hostname: "localhost", headers: {} },
    res: {},
  } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}

describe("voice-only signaling tRPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lưu offer/answer/ICE qua helper MySQL với sender đã xác thực", async () => {
    vi.mocked(db.createVoiceSignal).mockResolvedValue({ id: 81, recipientId: 9 } as never);
    const result = await callerFor(7).voice.signal.send({ callId: CALL_ID, type: "offer", payload: "{}" });
    expect(result).toEqual({ id: 81, recipientId: 9 });
    expect(db.createVoiceSignal).toHaveBeenCalledWith({ callId: CALL_ID, type: "offer", payload: "{}", senderId: 7 });
  });

  it("từ chối loại tín hiệu ngoài audio WebRTC trước khi chạm database", async () => {
    await expect(callerFor(7).voice.signal.send({ callId: CALL_ID, type: "screen" as never, payload: "{}" })).rejects.toThrow();
    expect(db.createVoiceSignal).not.toHaveBeenCalled();
  });

  it("chỉ cấp ICE sau khi helper xác nhận người gọi thuộc voice session", async () => {
    vi.mocked(db.getVoiceCallSession).mockResolvedValue({ id: CALL_ID } as never);
    const result = await callerFor(7).voice.iceConfig({ callId: CALL_ID });
    expect(db.getVoiceCallSession).toHaveBeenCalledWith(CALL_ID, 7);
    expect(getVoiceIceServers).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  });
});
