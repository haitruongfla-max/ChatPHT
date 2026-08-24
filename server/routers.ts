import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { assertValidUsername, hashPassword, normalizeUsername, verifyPassword } from "./auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { runMediaCleanup } from "./media-cleanup";
import { dispatchIncomingCallPushNotification, dispatchNewMessagePushNotifications } from "./push";
import { createMediaAccessUrl } from "./media-access";
import { emitConversationBackgroundUpdated } from "./_core/realtime";
import { createOpaqueStorageKey, storageCreateUploadUrl, storageDelete, storagePut } from "./storage";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getP2pIceConfiguration } from "./p2p-turn";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(24),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự.").max(128),
});

const mediaMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
]);
const videoMimeSchema = z.enum(["video/mp4", "video/quicktime"]);
const avatarMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
const reactionEmojiSchema = z.enum(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const MAX_WALLPAPER_BYTES = 6 * 1024 * 1024;
const assistantTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200),
});

function getAssistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) =>
      part && typeof part === "object" && "type" in part && "text" in part && part.type === "text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("\n")
    .trim();
}

function publicMessage(message: Awaited<ReturnType<typeof db.createMessage>> | Awaited<ReturnType<typeof db.listMessages>>[number], mediaUrl: string | null) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    body: message.body,
    contentType: message.contentType,
    mediaMime: message.mediaMime,
    mediaName: message.mediaName,
    mediaSize: message.mediaSize,
    mediaBatchId: message.mediaBatchId,
    replyToMessageId: message.replyToMessageId,
    replyTo: "replyTo" in message ? message.replyTo : null,
    recalledAt: message.recalledAt,
    recalledBy: message.recalledBy,
    createdAt: message.createdAt,
    mediaUrl,
    mediaCacheKey: message.mediaKey ? `chat-media-${message.id}` : null,
    mediaCleanedAt: message.mediaCleanedAt ?? null,
    reactions: "reactions" in message ? message.reactions : [],
    recipientDeliveredAt: "recipientDeliveredAt" in message ? message.recipientDeliveredAt : null,
    recipientReadAt: "recipientReadAt" in message ? message.recipientReadAt : null,
  };
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/mp4") return "mp4";
  return "jpg";
}

function chatMediaKey(conversationId: number, userId: number, mimeType: string) {
  return createOpaqueStorageKey(`chatpht/media/${conversationId}/${userId}`, extensionForMime(mimeType));
}

async function withSecureAvatarUrls<T>(ctx: { req: any; user: any }, value: T): Promise<T> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => withSecureAvatarUrls(ctx, item))) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const record = value as Record<string, unknown>;
  const clone: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    if (key === "avatarUrl" && typeof nested === "string" && nested.startsWith("/manus-storage/")) {
      clone[key] = await createMediaAccessUrl(ctx.req, ctx.user, nested.slice("/manus-storage/".length));
    } else {
      clone[key] = await withSecureAvatarUrls(ctx, nested);
    }
  }
  return clone as T;
}

async function withSecureGroupAvatar<T extends { avatarKey: string | null }>(ctx: { req: any; user: any }, group: T) {
  const { avatarKey, ...safeGroup } = group;
  return {
    ...safeGroup,
    avatarUrl: avatarKey ? await createMediaAccessUrl(ctx.req, ctx.user, avatarKey) : null,
  };
}

async function signInResponse(ctx: { req: any; res: any }, user: Awaited<ReturnType<typeof db.getUserById>>) {
  if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không thể tạo phiên đăng nhập." });
  if (db.isUserAccessExpired(user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Thời hạn sử dụng tài khoản đã kết thúc. Vui lòng liên hệ quản trị viên." });
  }
  const token = await sdk.createSessionToken(user.openId, { name: user.name ?? user.username ?? "ChatPHT" });
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: ONE_YEAR_MS,
  });
  return { token, user: await withSecureAvatarUrls({ ...ctx, user }, db.toPublicProfile(user)) };
}

function appError(error: unknown, fallback: string): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : fallback;
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? withSecureAvatarUrls(ctx, db.toPublicProfile(ctx.user)) : null)),
    usernameAvailable: publicProcedure
      .input(z.object({ username: z.string().trim().min(3).max(24) }))
      .query(async ({ input }) => {
        const username = normalizeUsername(input.username);
        try {
          assertValidUsername(username);
        } catch {
          return { available: false };
        }
        return { available: !(await db.getUserByUsername(username)) };
      }),
    signup: publicProcedure
      .input(
        credentialsSchema.extend({ displayName: z.string().trim().min(2, "Nhập tên hiển thị.").max(48) }),
      )
      .mutation(async ({ ctx, input }) => {
        const username = normalizeUsername(input.username);
        try {
          assertValidUsername(username);
        } catch (error) {
          return appError(error, "Tên người dùng không hợp lệ.");
        }
        if (await db.getUserByUsername(username)) {
          throw new TRPCError({ code: "CONFLICT", message: "Tên người dùng này đã được sử dụng." });
        }
        const user = await db.createLocalUser({
          username,
          displayName: input.displayName,
          passwordHash: await hashPassword(input.password),
        });
        return signInResponse(ctx, user);
      }),
    login: publicProcedure.input(credentialsSchema).mutation(async ({ ctx, input }) => {
      const username = normalizeUsername(input.username);
      const user = await db.getUserByUsername(username);
      if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Tên người dùng hoặc mật khẩu không đúng." });
      }
      await db.touchUser(user.id);
      return signInResponse(ctx, user);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profile: router({
    me: protectedProcedure.query(({ ctx }) => withSecureAvatarUrls(ctx, db.toPublicProfile(ctx.user))),
    requestAvatarUpload: protectedProcedure
      .input(z.object({ filename: z.string().trim().min(1).max(80), mimeType: avatarMimeSchema, size: z.number().int().positive().max(MAX_AVATAR_BYTES) }))
      .mutation(async ({ ctx, input }) => {
        const storage = await storageCreateUploadUrl(createOpaqueStorageKey(`chatpht/avatars/${ctx.user.id}`, extensionForMime(input.mimeType)));
        return { ...storage, maximumSize: MAX_AVATAR_BYTES };
      }),
    update: protectedProcedure
      .input(z.object({ displayName: z.string().trim().min(2, "Tên hiển thị cần ít nhất 2 ký tự.").max(48), avatarKey: z.string().trim().min(18).max(512).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.avatarKey !== undefined && input.avatarKey !== null && !input.avatarKey.startsWith(`chatpht/avatars/${ctx.user.id}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Ảnh đại diện không thuộc về tài khoản này." });
        }
        const updated = await db.updateOwnProfile({ userId: ctx.user.id, displayName: input.displayName, avatarKey: input.avatarKey });
        if (updated.replacedAvatarKey) void storageDelete(updated.replacedAvatarKey).catch(() => undefined);
        return withSecureAvatarUrls(ctx, updated.profile);
      }),
  }),
  admin: router({
    listUsers: adminProcedure.query(async ({ ctx }) => withSecureAvatarUrls(ctx, await db.listManagedUsers())),
    storageSummary: adminProcedure.query(() => db.getStorageUsageSummary()),
    operationalStats: adminProcedure.query(() => db.getAdminOperationalStats()),
    updateStorageQuota: adminProcedure
      .input(z.object({ quotaGb: z.union([z.literal(20), z.literal(50), z.literal(100), z.literal(200)]), unlimited: z.boolean() }))
      .mutation(async ({ input }) => {
        const settings = await db.updateStorageQuotaSettings(input);
        void runMediaCleanup().catch((error) => console.error("[storage] Immediate cleanup after quota update failed", error));
        return settings;
      }),
    setAccessDays: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), days: z.number().int().min(1).max(3650) }))
      .mutation(async ({ input }) => {
        const accessExpiresAt = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
        return db.setUserAccessExpiry(input.userId, accessExpiresAt);
      }),
    clearAccessExpiry: adminProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(({ input }) => db.setUserAccessExpiry(input.userId, null)),
    deleteUser: adminProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const removed = await db.deleteManagedUser(input.userId);
        await Promise.allSettled(removed.mediaKeys.map((key) => storageDelete(key)));
        return { success: true as const, username: removed.username };
      }),
  }),
  assistant: router({
    ask: protectedProcedure
      .input(
        z.object({
          message: z.string().trim().min(1, "Hãy nhập câu hỏi của bạn.").max(2000, "Câu hỏi quá dài."),
          context: z.array(assistantTurnSchema).max(6).default([]),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const result = await invokeLLM({
            model: "gpt-5-mini",
            maxCompletionTokens: 900,
            reasoning: { effort: "minimal" },
            messages: [
              {
                role: "system",
                content:
                  "Bạn là trợ lý AI riêng của ChatPHT. Trả lời bằng tiếng Việt rõ ràng, hữu ích và ngắn gọn. Không khẳng định bạn có thể xem dữ liệu, hội thoại hay tệp riêng tư của người dùng. Khi câu hỏi cần chuyên gia y tế, pháp lý hoặc tài chính, hãy khuyến khích người dùng tham khảo chuyên gia phù hợp.",
              },
              ...input.context.map((turn) => ({ role: turn.role, content: turn.content })),
              { role: "user", content: input.message },
            ],
          });
          const answer = getAssistantText(result.choices[0]?.message.content).slice(0, 1200);
          if (!answer) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Chưa nhận được câu trả lời từ AI. Hãy chạm “Thử lại” để gửi lại câu hỏi của bạn.",
            });
          }
          return { answer };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("[assistant.ask]", error instanceof Error ? error.message : "Unknown AI error");
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Không thể kết nối với Trợ lý AI lúc này. Hãy kiểm tra mạng và chạm “Thử lại”.",
          });
        }
      }),
  }),
  notifications: router({
    registerDevice: protectedProcedure
      .input(
        z.object({
          token: z.string().trim().min(16).max(255).regex(/^(?:Expo|Exponent)PushToken\[[^\]]+\]$/),
          platform: z.enum(["ios", "android"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await db.upsertPushDevice({ userId: ctx.user.id, ...input });
        return { success: true } as const;
      }),
    unregisterDevice: protectedProcedure
      .input(z.object({ token: z.string().trim().min(16).max(255) }))
      .mutation(async ({ ctx, input }) => {
        await db.removePushDevice(ctx.user.id, input.token);
        return { success: true } as const;
      }),
  }),
  calls: router({
    start: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), kind: z.enum(["audio", "video"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const call = await db.createCallSession(input.conversationId, ctx.user.id, input.kind);
          void dispatchIncomingCallPushNotification({ conversationId: input.conversationId, senderId: ctx.user.id, callId: call.id, kind: input.kind });
          return call;
        } catch (error) {
          return appError(error, "Không thể bắt đầu cuộc gọi.");
        }
      }),
    listByConversation: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(60) }))
      .query(async ({ ctx, input }) => {
        try {
          return await withSecureAvatarUrls(ctx, await db.listCallSessionsByConversation(input.conversationId, ctx.user.id, input.limit));
        } catch (error) {
          return appError(error, "Không thể tải lịch sử cuộc gọi.");
        }
      }),
    incoming: protectedProcedure.query(async ({ ctx }) => withSecureAvatarUrls(ctx, await db.getIncomingCallSession(ctx.user.id))),
    get: protectedProcedure
      .input(z.object({ callId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const call = await db.getCallSession(input.callId, ctx.user.id);
        return call?.peer ? withSecureAvatarUrls(ctx, call) : call;
      }),
    answer: protectedProcedure
      .input(z.object({ callId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const call = await db.answerCallSession(input.callId, ctx.user.id);
          return { call };
        } catch (error) {
          return appError(error, "Không thể nhận cuộc gọi.");
        }
      }),
    p2pIceConfig: protectedProcedure
      .input(z.object({ callId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          await db.authorizeP2pIceConfig(input.callId, ctx.user.id);
          return getP2pIceConfiguration({
            turnUrls: ENV.p2pTurnUrls,
            turnAuthMode: ENV.p2pTurnAuthMode,
            turnSharedSecret: ENV.p2pTurnSharedSecret,
            turnUsername: ENV.p2pTurnUsername,
            turnCredential: ENV.p2pTurnCredential,
          }, { userId: ctx.user.id, callId: input.callId });
        } catch (error) {
          return appError(error, "Không thể lấy cấu hình kết nối P2P.");
        }
      }),
    getTurnCredentials: protectedProcedure
      .input(z.object({ callId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          await db.authorizeP2pIceConfig(input.callId, ctx.user.id);
          const configuration = getP2pIceConfiguration({
            turnUrls: ENV.p2pTurnUrls,
            turnAuthMode: ENV.p2pTurnAuthMode,
            turnSharedSecret: ENV.p2pTurnSharedSecret,
            turnUsername: ENV.p2pTurnUsername,
            turnCredential: ENV.p2pTurnCredential,
          }, { userId: ctx.user.id, callId: input.callId });
          return { hasTurn: configuration.hasTurn, turn: configuration.turn };
        } catch (error) {
          return appError(error, "Không thể lấy thông tin TURN cho cuộc gọi này.");
        }
      }),
    p2pSignal: router({
      send: protectedProcedure
        .input(z.object({ callId: z.string().uuid(), type: z.enum(["offer", "answer", "ice", "screen-start", "screen-stop"]), payload: z.string().min(2).max(100_000) }))
        .mutation(async ({ ctx, input }) => {
          try {
            return await db.createP2pSignal({ ...input, senderId: ctx.user.id });
          } catch (error) {
            return appError(error, "Không thể gửi tín hiệu kết nối riêng tư.");
          }
        }),
      drain: protectedProcedure
        .input(z.object({ callId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
          try {
            return await db.drainP2pSignals(input.callId, ctx.user.id);
          } catch (error) {
            return appError(error, "Không thể nhận tín hiệu kết nối riêng tư.");
          }
        }),
    }),
    decline: protectedProcedure
      .input(z.object({ callId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.finishCallSession(input.callId, ctx.user.id, "declined");
          return { success: true };
        } catch (error) {
          return appError(error, "Không thể từ chối cuộc gọi.");
        }
      }),
    end: protectedProcedure
      .input(z.object({ callId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.finishCallSession(input.callId, ctx.user.id, "ended");
          return { success: true };
        } catch (error) {
          return appError(error, "Không thể kết thúc cuộc gọi.");
        }
      }),
  }),
  friends: router({
    search: protectedProcedure
      .input(z.object({ query: z.string().trim().min(1).max(24) }))
      .query(async ({ ctx, input }) => withSecureAvatarUrls(ctx, await db.searchProfiles(normalizeUsername(input.query), ctx.user.id))),
    incoming: protectedProcedure.query(async ({ ctx }) => withSecureAvatarUrls(ctx, await db.listIncomingFriendRequests(ctx.user.id))),
    contacts: protectedProcedure.query(async ({ ctx }) => withSecureAvatarUrls(ctx, await db.listContacts(ctx.user.id))),
    request: protectedProcedure
      .input(z.object({ username: z.string().trim().min(3).max(24) }))
      .mutation(async ({ ctx, input }) => {
        const target = await db.getUserByUsername(normalizeUsername(input.username));
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy người dùng này." });
        if (target.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Bạn không thể tự kết bạn với chính mình." });
        const friendship = await db.getFriendship(ctx.user.id, target.id);
        if (friendship?.status === "accepted") {
          return { status: "accepted" as const, conversationId: (await db.getOrCreateDirectConversation(ctx.user.id, target.id)).id };
        }
        if (friendship?.status === "pending") {
          throw new TRPCError({ code: "CONFLICT", message: "Đã có lời mời kết bạn đang chờ xử lý." });
        }
        await db.sendFriendRequest(ctx.user.id, target.id);
        return { status: "pending" as const };
      }),
    respond: protectedProcedure
      .input(z.object({ requestId: z.number().int().positive(), accept: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const request = await db.respondToFriendRequest(input.requestId, ctx.user.id, input.accept);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Lời mời không còn hiệu lực." });
        const conversation = input.accept
          ? await db.getOrCreateDirectConversation(ctx.user.id, request.senderId)
          : null;
        return { status: request.status, conversationId: conversation?.id ?? null };
      }),
  }),
  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const conversations = await db.listConversations(ctx.user.id);
      return Promise.all(conversations.map(async (item) => item.group
        ? { ...item, group: await withSecureGroupAvatar(ctx, item.group) }
        : withSecureAvatarUrls(ctx, item)));
    }),
    createGroup: protectedProcedure
      .input(z.object({ title: z.string().trim().min(1, "Nhập tên nhóm.").max(80), memberIds: z.array(z.number().int().positive()).min(1).max(49) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return withSecureGroupAvatar(ctx, await db.createGroupConversation({ creatorId: ctx.user.id, title: input.title, memberIds: input.memberIds }));
        } catch (error) {
          return appError(error, "Không thể tạo nhóm.");
        }
      }),
    groupDetails: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        try {
          return withSecureGroupAvatar(ctx, await db.getGroupConversationSummary(input.conversationId, ctx.user.id));
        } catch (error) {
          return appError(error, "Không thể tải thông tin nhóm.");
        }
      }),
    groupMembers: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        try {
          return withSecureAvatarUrls(ctx, await db.listGroupMembers(input.conversationId, ctx.user.id));
        } catch (error) {
          return appError(error, "Không thể tải thành viên nhóm.");
        }
      }),
    addGroupMembers: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), userIds: z.array(z.number().int().positive()).min(1).max(49) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return withSecureAvatarUrls(ctx, await db.addGroupMembers({ ...input, requesterId: ctx.user.id }));
        } catch (error) {
          return appError(error, "Không thể thêm thành viên.");
        }
      }),
    removeGroupMember: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.removeGroupMember({ ...input, requesterId: ctx.user.id });
        } catch (error) {
          return appError(error, "Không thể xóa thành viên.");
        }
      }),
    updateGroupMemberRole: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), userId: z.number().int().positive(), role: z.enum(["admin", "member"]) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return withSecureAvatarUrls(ctx, await db.updateGroupMemberRole({ ...input, requesterId: ctx.user.id }));
        } catch (error) {
          return appError(error, "Không thể cập nhật quyền quản trị viên.");
        }
      }),
    requestGroupAvatarUpload: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), mimeType: avatarMimeSchema, size: z.number().int().positive().max(MAX_AVATAR_BYTES) }))
      .mutation(async ({ ctx, input }) => {
        await db.getGroupConversationSummary(input.conversationId, ctx.user.id);
        const storage = await storageCreateUploadUrl(
          createOpaqueStorageKey(`chatpht/group-avatars/${input.conversationId}`, extensionForMime(input.mimeType)),
        );
        return { ...storage, maximumSize: MAX_AVATAR_BYTES };
      }),
    updateGroup: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), title: z.string().trim().min(1).max(80).optional(), avatarKey: z.string().trim().min(20).max(512).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.avatarKey && !input.avatarKey.startsWith(`chatpht/group-avatars/${input.conversationId}/`)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Avatar không thuộc nhóm này." });
        }
        try {
          return withSecureGroupAvatar(ctx, await db.updateGroupConversation({ ...input, requesterId: ctx.user.id }));
        } catch (error) {
          return appError(error, "Không thể cập nhật nhóm.");
        }
      }),
    pinGroupMessage: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), messageId: z.number().int().positive().nullable() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return withSecureGroupAvatar(ctx, await db.pinGroupMessage({ ...input, requesterId: ctx.user.id }));
        } catch (error) {
          return appError(error, "Không thể ghim tin nhắn.");
        }
      }),
    wallpaper: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        try {
          const wallpaper = await db.getConversationWallpaperKey(input.conversationId, ctx.user.id);
          return {
            key: wallpaper.wallpaperKey,
            url: wallpaper.wallpaperKey ? await createMediaAccessUrl(ctx.req, ctx.user, wallpaper.wallpaperKey) : null,
            opacity: wallpaper.wallpaperOpacity,
            size: wallpaper.wallpaperSize,
            updatedAt: wallpaper.backgroundUpdatedAt,
          };
        } catch (error) {
          return appError(error, "Không thể tải ảnh nền hội thoại.");
        }
      }),
    requestWallpaperUpload: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), mimeType: avatarMimeSchema, size: z.number().int().positive().max(MAX_WALLPAPER_BYTES) }))
      .mutation(async ({ ctx, input }) => {
        await db.getConversationWallpaperKey(input.conversationId, ctx.user.id);
        const usage = await db.getStorageUsageSummary();
        const projectedBytes = usage.usedBytes + input.size;
        const nearQuota = !usage.unlimited && usage.quotaBytes !== null && projectedBytes >= usage.quotaBytes * 0.9;
        const storage = await storageCreateUploadUrl(
          createOpaqueStorageKey(`chatpht/conversation-backgrounds/${input.conversationId}`, extensionForMime(input.mimeType)),
        );
        return { ...storage, maximumSize: MAX_WALLPAPER_BYTES, nearQuota, projectedBytes };
      }),
    setWallpaper: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        wallpaperKey: z.string().trim().min(20).max(512).nullable(),
        opacity: z.number().int().min(35).max(90).optional(),
        size: z.number().int().positive().max(MAX_WALLPAPER_BYTES).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sharedPrefix = `chatpht/conversation-backgrounds/${input.conversationId}/`;
        const legacyPrefix = `chatpht/wallpapers/${ctx.user.id}/${input.conversationId}/`;
        if (input.wallpaperKey && !input.wallpaperKey.startsWith(sharedPrefix) && !input.wallpaperKey.startsWith(legacyPrefix)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Ảnh nền không thuộc về hội thoại này." });
        }
        const result = input.size === undefined
          ? await db.setConversationWallpaperKey(input.conversationId, ctx.user.id, input.wallpaperKey, input.opacity)
          : await db.setConversationWallpaperKey(input.conversationId, ctx.user.id, input.wallpaperKey, input.opacity, input.size);
        if (result.previousKey && result.previousKey !== input.wallpaperKey) {
          void storageDelete(result.previousKey).catch(() => undefined);
        }
        emitConversationBackgroundUpdated({
          conversationId: input.conversationId,
          updatedAt: result.backgroundUpdatedAt.toISOString(),
        });
        return {
          key: result.wallpaperKey,
          url: result.wallpaperKey ? await createMediaAccessUrl(ctx.req, ctx.user, result.wallpaperKey) : null,
          opacity: result.wallpaperOpacity,
          size: result.wallpaperSize,
          updatedAt: result.backgroundUpdatedAt,
        };
      }),
    markAllDelivered: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markAllConversationsDelivered(ctx.user.id);
      return { success: true as const };
    }),
    open: protectedProcedure
      .input(z.object({ peerId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const friendship = await db.getFriendship(ctx.user.id, input.peerId);
        if (friendship?.status !== "accepted") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn cần kết bạn trước khi bắt đầu trò chuyện." });
        }
        const conversation = await db.getOrCreateDirectConversation(ctx.user.id, input.peerId);
        await db.restoreConversationForUser(conversation.id, ctx.user.id);
        const peer = await db.getConversationPeer(conversation.id, ctx.user.id);
        return withSecureAvatarUrls(ctx, { id: conversation.id, peer });
      }),
    remove: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.hideConversationForUser(input.conversationId, ctx.user.id);
          return { success: true };
        } catch (error) {
          return appError(error, "Không thể xóa hội thoại.");
        }
      }),
    clearContent: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const cleared = await db.clearConversationContent(input.conversationId, ctx.user.id);
          await Promise.all(cleared.mediaKeys.map((mediaKey) => storageDelete(mediaKey)));
          return {
            success: true as const,
            clearedMessages: cleared.messagesDeleted,
            clearedMedia: cleared.mediaKeys.length,
          };
        } catch (error) {
          return appError(error, "Không thể xóa sạch nội dung hội thoại.");
        }
      }),
  }),
  messages: router({
    list: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        try {
          const items = await db.listMessages(input.conversationId, ctx.user.id);
          return Promise.all(
            items.map(async (message) => publicMessage(message, message.mediaKey && !message.mediaCleanedAt ? await createMediaAccessUrl(ctx.req, ctx.user, message.mediaKey) : null)),
          );
        } catch (error) {
          return appError(error, "Không thể tải tin nhắn.");
        }
      }),
    markRead: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await db.markConversationRead(input.conversationId, ctx.user.id);
          return { success: true as const };
        } catch (error) {
          return appError(error, "Không thể cập nhật trạng thái đã đọc.");
        }
      }),
    typingStatus: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        try {
          return await db.getConversationTypingStatus(input.conversationId, ctx.user.id);
        } catch (error) {
          return appError(error, "Không thể tải trạng thái đang nhập.");
        }
      }),
    setTyping: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), isTyping: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.setConversationTyping(input.conversationId, ctx.user.id, input.isTyping);
        } catch (error) {
          return appError(error, "Không thể cập nhật trạng thái đang nhập.");
        }
      }),
    sendText: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), body: z.string().trim().min(1).max(2000), replyToMessageId: z.number().int().positive().nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const message = await db.createMessage({
            conversationId: input.conversationId,
            senderId: ctx.user.id,
            body: input.body,
            contentType: "text",
            replyToMessageId: input.replyToMessageId ?? null,
          });
          void dispatchNewMessagePushNotifications({ conversationId: message.conversationId, senderId: ctx.user.id });
          return publicMessage(message, null);
        } catch (error) {
          return appError(error, "Không thể gửi tin nhắn.");
        }
      }),
    toggleReaction: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive(), emoji: reactionEmojiSchema }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await db.toggleMessageReaction({ ...input, userId: ctx.user.id });
        } catch (error) {
          return appError(error, "Không thể cập nhật cảm xúc.");
        }
      }),
    upload: protectedProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          filename: z.string().trim().min(1).max(120),
          mimeType: mediaMimeSchema,
          base64: z.string().min(4).max(34 * 1024 * 1024),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Dữ liệu tệp không hợp lệ." });
        }
        const data = Buffer.from(input.base64, "base64");
        const maximum = input.mimeType.startsWith("video/") ? 24 * 1024 * 1024 : MAX_IMAGE_BYTES;
        if (!data.length || data.length > maximum) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: input.mimeType.startsWith("video/") ? "Video tối đa 24 MB." : "Ảnh tối đa 20 MB.",
          });
        }
        const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const stored = await storagePut(
          chatMediaKey(input.conversationId, ctx.user.id, input.mimeType),
          data,
          input.mimeType,
        );
          const message = await db.createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          contentType: input.mimeType.startsWith("image/") ? "image" : "video",
          mediaKey: stored.key,
          mediaMime: input.mimeType,
          mediaName: safeFilename,
            mediaSize: data.length,
          });
          void dispatchNewMessagePushNotifications({ conversationId: message.conversationId, senderId: ctx.user.id });
          return publicMessage(message, await createMediaAccessUrl(ctx.req, ctx.user, stored.key));
      }),
    requestVideoUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        filename: z.string().trim().min(1).max(120),
        mimeType: videoMimeSchema,
        size: z.number().int().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        if (input.size > MAX_VIDEO_BYTES) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Video tối đa 1GB." });
        }
        const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "video.mp4";
        const storage = await storageCreateUploadUrl(chatMediaKey(input.conversationId, ctx.user.id, input.mimeType));
        return { ...storage, filename, maximumSize: MAX_VIDEO_BYTES };
      }),
    requestMediaUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        filename: z.string().trim().min(1).max(120),
        mimeType: mediaMimeSchema,
        size: z.number().int().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
       const maximumSize = input.mimeType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
       if (input.size > maximumSize) {
         throw new TRPCError({
           code: "PAYLOAD_TOO_LARGE",
            message: input.mimeType.startsWith("video/") ? "Video tối đa 1GB." : "Ảnh tối đa 20 MB.",
         });
        }
        const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const storage = await storageCreateUploadUrl(chatMediaKey(input.conversationId, ctx.user.id, input.mimeType));
        return { ...storage, filename, maximumSize };
      }),
    preflightMediaUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        totalBytes: z.number().int().positive().max(MAX_VIDEO_BYTES * 50),
        fileCount: z.number().int().min(1).max(50),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        const usage = await db.getStorageUsageSummary();
        const projectedBytes = usage.usedBytes + input.totalBytes;
        const nearQuota = !usage.unlimited && usage.quotaBytes !== null && projectedBytes >= usage.quotaBytes * 0.9;
        return { nearQuota, projectedBytes, quotaBytes: usage.quotaBytes, unlimited: usage.unlimited };
      }),
    completeVideoUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        key: z.string().trim().min(10).max(320),
        filename: z.string().trim().min(1).max(120),
        mimeType: videoMimeSchema,
        size: z.number().int().positive(),
        mediaBatchId: z.string().trim().min(12).max(80).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        if (input.size > MAX_VIDEO_BYTES) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Video tối đa 1GB." });
        }
        const ownedPrefix = `chatpht/media/${input.conversationId}/${ctx.user.id}/`;
        if (!input.key.startsWith(ownedPrefix)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Tệp tải lên không hợp lệ." });
        }
        const message = await db.createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          contentType: "video",
          mediaKey: input.key,
          mediaMime: input.mimeType,
          mediaName: input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100),
          mediaSize: input.size,
          mediaBatchId: input.mediaBatchId ?? null,
        });
        void dispatchNewMessagePushNotifications({ conversationId: message.conversationId, senderId: ctx.user.id });
        return publicMessage(message, await createMediaAccessUrl(ctx.req, ctx.user, input.key));
      }),
    completeMediaUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        key: z.string().trim().min(10).max(320),
        filename: z.string().trim().min(1).max(120),
        mimeType: mediaMimeSchema,
        size: z.number().int().positive(),
        mediaBatchId: z.string().trim().min(12).max(80).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
       const maximumSize = input.mimeType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
       if (input.size > maximumSize) {
         throw new TRPCError({
           code: "PAYLOAD_TOO_LARGE",
            message: input.mimeType.startsWith("video/") ? "Video tối đa 1GB." : "Ảnh tối đa 20 MB.",
         });
       }
        const ownedPrefix = `chatpht/media/${input.conversationId}/${ctx.user.id}/`;
        if (!input.key.startsWith(ownedPrefix)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Tệp tải lên không hợp lệ." });
        }
        const message = await db.createMessage({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          contentType: input.mimeType.startsWith("image/") ? "image" : "video",
          mediaKey: input.key,
          mediaMime: input.mimeType,
          mediaName: input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100),
          mediaSize: input.size,
          mediaBatchId: input.mediaBatchId ?? null,
        });
        void dispatchNewMessagePushNotifications({ conversationId: message.conversationId, senderId: ctx.user.id });
        return publicMessage(message, await createMediaAccessUrl(ctx.req, ctx.user, input.key));
      }),
    recall: protectedProcedure
      .input(z.object({ messageId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const message = await db.recallMessage(input.messageId, ctx.user.id);
          return publicMessage(message, null);
        } catch (error) {
          return appError(error, "Không thể thu hồi tin nhắn.");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
