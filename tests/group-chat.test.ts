import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  isUserAccessExpired: vi.fn(() => false),
  listConversations: vi.fn(),
  createGroupConversation: vi.fn(),
  getGroupConversationSummary: vi.fn(),
  listGroupMembers: vi.fn(),
  addGroupMembers: vi.fn(),
  removeGroupMember: vi.fn(),
  updateGroupMemberRole: vi.fn(),
  updateGroupConversation: vi.fn(),
  pinGroupMessage: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storagePut: vi.fn(),
  storageCreateUploadUrl: vi.fn(),
  storageDelete: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  createOpaqueStorageKey: vi.fn((prefix: string, extension: string) => `${prefix}/opaque-object.${extension}`),
}));

vi.mock("../server/media-access", () => ({
  createMediaAccessUrl: vi.fn(() => "https://api.example/api/media/capability?access_token=short-lived"),
}));

import * as db from "../server/db";
import { appRouter } from "../server/routers";

function callerFor(userId = 7) {
  return appRouter.createCaller({
    user: { id: userId, role: "user", accessExpiresAt: null },
    req: { headers: { host: "api.example" }, protocol: "https" },
    res: { cookie: vi.fn(), clearCookie: vi.fn() },
  } as any);
}

const group = {
  id: 18,
  kind: "group",
  title: "Nhóm trực",
  avatarKey: null,
  createdBy: 7,
  pinnedMessageId: null,
  memberCount: 3,
};

describe("group chat router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("giới hạn lời mời ở 49 người để cả nhóm gồm tối đa 50 thành viên kể cả người tạo", async () => {
    await expect(callerFor().conversations.createGroup({
      title: "Nhóm 51 người",
      memberIds: Array.from({ length: 50 }, (_, index) => index + 10),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.createGroupConversation).not.toHaveBeenCalled();

    vi.mocked(db.createGroupConversation).mockResolvedValue(group as any);
    await expect(callerFor().conversations.createGroup({
      title: "Nhóm tối đa",
      memberIds: Array.from({ length: 49 }, (_, index) => index + 10),
    })).resolves.toMatchObject({ id: 18, title: "Nhóm trực", memberCount: 3 });
    expect(db.createGroupConversation).toHaveBeenCalledWith({
      creatorId: 7,
      title: "Nhóm tối đa",
      memberIds: Array.from({ length: 49 }, (_, index) => index + 10),
    });
  });

  it("không che giấu việc tầng dữ liệu từ chối người không phải thành viên", async () => {
    vi.mocked(db.getGroupConversationSummary).mockRejectedValue(new Error("Bạn không phải thành viên nhóm này."));

    await expect(callerFor(99).conversations.groupDetails({ conversationId: 18 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.getGroupConversationSummary).toHaveBeenCalledWith(18, 99);
  });

  it("ủy quyền việc ghim cho tầng dữ liệu và trả lỗi khi người không phải quản trị viên yêu cầu ghim", async () => {
    vi.mocked(db.pinGroupMessage).mockRejectedValue(new Error("Chỉ quản trị viên nhóm mới có thể ghim tin nhắn."));

    await expect(callerFor(12).conversations.pinGroupMessage({ conversationId: 18, messageId: 45 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.pinGroupMessage).toHaveBeenCalledWith({ conversationId: 18, messageId: 45, requesterId: 12 });
  });

  it("từ chối avatar không thuộc tiền tố kho riêng của nhóm trước khi cập nhật", async () => {
    await expect(callerFor().conversations.updateGroup({
      conversationId: 18,
      avatarKey: "chatpht/group-avatars/19/opaque-object.jpg",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.updateGroupConversation).not.toHaveBeenCalled();
  });

  it("chuyển yêu cầu cấp quyền quản trị đến tầng dữ liệu cùng requester và vai trò giới hạn", async () => {
    vi.mocked(db.updateGroupMemberRole).mockResolvedValue([] as any);

    await expect(callerFor(7).conversations.updateGroupMemberRole({
      conversationId: 18,
      userId: 12,
      role: "admin",
    })).resolves.toEqual([]);
    expect(db.updateGroupMemberRole).toHaveBeenCalledWith({
      conversationId: 18,
      userId: 12,
      role: "admin",
      requesterId: 7,
    });

    await expect(callerFor(7).conversations.updateGroupMemberRole({
      conversationId: 18,
      userId: 12,
      role: "owner" as never,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("giữ hình dạng inbox nhóm không lộ storage key avatar thô", async () => {
    vi.mocked(db.listConversations).mockResolvedValue([{
      id: 18,
      group: { title: "Nhóm trực", avatarKey: null, memberCount: 3 },
      latestMessage: null,
    }] as any);

    await expect(callerFor().conversations.list()).resolves.toEqual([{
      id: 18,
      group: { title: "Nhóm trực", memberCount: 3, avatarUrl: null },
      latestMessage: null,
    }]);
  });
});
