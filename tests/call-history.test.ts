import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  listCallSessionsByConversation: vi.fn(),
}));

import * as db from "../server/db";
import { appRouter } from "../server/routers";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId, role: "user", accessExpiresAt: null },
    req: {},
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

describe("call history router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the authenticated member's call history for one conversation", async () => {
    vi.mocked(db.listCallSessionsByConversation).mockResolvedValue([
      {
        id: "45e72ca3-6109-4cf2-b861-6d565bc470a3",
        conversationId: 18,
        kind: "video",
        status: "missed",
        createdAt: new Date("2026-08-21T10:00:00.000Z"),
        answeredAt: null,
        endedAt: new Date("2026-08-21T10:01:00.000Z"),
        direction: "incoming",
      },
    ] as any);

    await expect(callerFor(7).calls.listByConversation({ conversationId: 18, limit: 60 })).resolves.toMatchObject([
      { kind: "video", status: "missed", direction: "incoming" },
    ]);
    expect(db.listCallSessionsByConversation).toHaveBeenCalledWith(18, 7, 60);
  });

  it("does not conceal a data-layer permission failure", async () => {
    vi.mocked(db.listCallSessionsByConversation).mockRejectedValue(new Error("Bạn không có quyền xem lịch sử cuộc gọi này."));

    await expect(callerFor(9).calls.listByConversation({ conversationId: 18, limit: 20 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.listCallSessionsByConversation).toHaveBeenCalledWith(18, 9, 20);
  });
});
