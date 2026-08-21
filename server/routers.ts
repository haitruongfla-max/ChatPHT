import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { assertValidUsername, hashPassword, normalizeUsername, verifyPassword } from "./auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import * as db from "./db";
import { dispatchNewMessagePushNotifications } from "./push";
import { storageCreateUploadUrl, storageDelete, storageGetSignedUrl, storagePut } from "./storage";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

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
const reactionEmojiSchema = z.enum(["👍", "❤️", "😂", "😮", "😢", "🔥"]);
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
    recalledAt: message.recalledAt,
    recalledBy: message.recalledBy,
    createdAt: message.createdAt,
    mediaUrl,
    reactions: "reactions" in message ? message.reactions : [],
  };
}

async function signInResponse(ctx: { req: any; res: any }, user: Awaited<ReturnType<typeof db.getUserById>>) {
  if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không thể tạo phiên đăng nhập." });
  const token = await sdk.createSessionToken(user.openId, { name: user.name ?? user.username ?? "ChatPHT" });
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: ONE_YEAR_MS,
  });
  return { token, user: db.toPublicProfile(user) };
}

function appError(error: unknown, fallback: string): never {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : fallback;
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => (ctx.user ? db.toPublicProfile(ctx.user) : null)),
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
    me: protectedProcedure.query(({ ctx }) => db.toPublicProfile(ctx.user)),
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
  friends: router({
    search: protectedProcedure
      .input(z.object({ query: z.string().trim().min(1).max(24) }))
      .query(({ ctx, input }) => db.searchProfiles(normalizeUsername(input.query), ctx.user.id)),
    incoming: protectedProcedure.query(({ ctx }) => db.listIncomingFriendRequests(ctx.user.id)),
    contacts: protectedProcedure.query(({ ctx }) => db.listContacts(ctx.user.id)),
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
    list: protectedProcedure.query(({ ctx }) => db.listConversations(ctx.user.id)),
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
        return { id: conversation.id, peer };
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
            items.map(async (message) => publicMessage(message, message.mediaKey ? await storageGetSignedUrl(message.mediaKey) : null)),
          );
        } catch (error) {
          return appError(error, "Không thể tải tin nhắn.");
        }
      }),
    sendText: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive(), body: z.string().trim().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const message = await db.createMessage({
            conversationId: input.conversationId,
            senderId: ctx.user.id,
            body: input.body,
            contentType: "text",
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
        const maximum = input.mimeType.startsWith("video/") ? 24 * 1024 * 1024 : 8 * 1024 * 1024;
        if (!data.length || data.length > maximum) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: input.mimeType.startsWith("video/") ? "Video tối đa 24 MB." : "Ảnh tối đa 8 MB.",
          });
        }
        const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const stored = await storagePut(
          `swiftchat/${input.conversationId}/${ctx.user.id}/${Date.now()}-${safeFilename}`,
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
          return publicMessage(message, await storageGetSignedUrl(stored.key));
      }),
    requestVideoUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        filename: z.string().trim().min(1).max(120),
        mimeType: videoMimeSchema,
        size: z.number().int().positive().max(MAX_VIDEO_BYTES),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "video.mp4";
        const storage = await storageCreateUploadUrl(`swiftchat/${input.conversationId}/${ctx.user.id}/${Date.now()}-${filename}`);
        return { ...storage, filename, maximumSize: MAX_VIDEO_BYTES };
      }),
    requestMediaUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        filename: z.string().trim().min(1).max(120),
        mimeType: mediaMimeSchema,
        size: z.number().int().positive().max(MAX_VIDEO_BYTES),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        const maximumSize = input.mimeType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (input.size > maximumSize) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: input.mimeType.startsWith("video/") ? "Video tối đa 100 MB." : "Ảnh tối đa 8 MB.",
          });
        }
        const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const storage = await storageCreateUploadUrl(`swiftchat/${input.conversationId}/${ctx.user.id}/${Date.now()}-${filename}`);
        return { ...storage, filename, maximumSize };
      }),
    completeVideoUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        key: z.string().trim().min(10).max(320),
        filename: z.string().trim().min(1).max(120),
        mimeType: videoMimeSchema,
        size: z.number().int().positive().max(MAX_VIDEO_BYTES),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        const ownedPrefix = `swiftchat/${input.conversationId}/${ctx.user.id}/`;
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
        });
        void dispatchNewMessagePushNotifications({ conversationId: message.conversationId, senderId: ctx.user.id });
        return publicMessage(message, await storageGetSignedUrl(input.key));
      }),
    completeMediaUpload: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        key: z.string().trim().min(10).max(320),
        filename: z.string().trim().min(1).max(120),
        mimeType: mediaMimeSchema,
        size: z.number().int().positive().max(MAX_VIDEO_BYTES),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!(await db.isConversationMember(input.conversationId, ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền gửi tệp vào hội thoại này." });
        }
        const maximumSize = input.mimeType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (input.size > maximumSize) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: input.mimeType.startsWith("video/") ? "Video tối đa 100 MB." : "Ảnh tối đa 8 MB.",
          });
        }
        const ownedPrefix = `swiftchat/${input.conversationId}/${ctx.user.id}/`;
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
        });
        void dispatchNewMessagePushNotifications({ conversationId: message.conversationId, senderId: ctx.user.id });
        return publicMessage(message, await storageGetSignedUrl(input.key));
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
