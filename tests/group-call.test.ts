import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  createGroupCallSession: vi.fn(),
  getJoinableGroupCallSession: vi.fn(),
  leaveGroupCallSession: vi.fn(),
  listConversationRecipientDevices: vi.fn(),
}));

vi.mock("../server/call-token", () => ({
  createLiveKitCallToken: vi.fn(),
}));

import * as db from "../server/db";
import { createLiveKitCallToken } from "../server/call-token";
import { appRouter } from "../server/routers";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId, name: "Thành viên thử nghiệm", username: "member", role: "user", accessExpiresAt: null },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

const call = {
  id: "45e72ca3-6109-4cf2-b861-6d565bc470a3",
  room: "chatpht-group-45e72ca3",
  conversationId: 18,
  kind: "video",
  isGroup: true,
  provider: "livekit",
  status: "active",
};

describe("group call router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLiveKitCallToken).mockResolvedValue({ serverUrl: "wss://livekit.example", token: "short-lived-token" } as any);
    vi.mocked(db.listConversationRecipientDevices).mockResolvedValue([] as any);
  });

  it("creates a LiveKit-only group room using the authenticated caller identity", async () => {
    vi.mocked(db.createGroupCallSession).mockResolvedValue(call as any);

    await expect(callerFor(7).calls.startGroup({ conversationId: 18, kind: "video" })).resolves.toMatchObject({ call, session: { token: "short-lived-token" } });
    expect(db.createGroupCallSession).toHaveBeenCalledWith(18, 7, "video");
    expect(createLiveKitCallToken).toHaveBeenCalledWith(expect.objectContaining({ room: call.room, identity: "user-7", displayName: "Thành viên thử nghiệm" }));
  });

  it("mints a fresh short-lived token only after the data layer authorizes group membership and capacity", async () => {
    vi.mocked(db.getJoinableGroupCallSession).mockResolvedValue({ call, participantCount: 3 } as any);

    await expect(callerFor(9).calls.joinGroup({ callId: call.id })).resolves.toMatchObject({ call, participantCount: 3, session: { token: "short-lived-token" } });
    expect(db.getJoinableGroupCallSession).toHaveBeenCalledWith(call.id, 9);
    expect(createLiveKitCallToken).toHaveBeenCalledWith(expect.objectContaining({ room: call.room, identity: "user-9" }));
  });

  it("surfaces a member or eight-person capacity rejection and does not mint a token", async () => {
    vi.mocked(db.getJoinableGroupCallSession).mockRejectedValue(new Error("Phòng gọi nhóm đã đủ 8 người."));

    await expect(callerFor(9).calls.joinGroup({ callId: call.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createLiveKitCallToken).not.toHaveBeenCalled();
  });

  it("uses the dedicated leave operation so a participant cannot accidentally end a group room", async () => {
    vi.mocked(db.leaveGroupCallSession).mockResolvedValue({ ...call, status: "active" } as any);

    await expect(callerFor(9).calls.leaveGroup({ callId: call.id })).resolves.toMatchObject({ status: "active" });
    expect(db.leaveGroupCallSession).toHaveBeenCalledWith(call.id, 9);
  });
});
