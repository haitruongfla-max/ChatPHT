import { and, desc, eq, inArray, like, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  callSessions,
  conversationMembers,
  conversations,
  friendRequests,
  messageReactions,
  messages,
  pushDevices,
  type CallSession,
  type InsertUser,
  type User,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

export type PublicProfile = {
  id: number;
  username: string;
  displayName: string;
};

export type CallKind = "audio" | "video";
export type CallStatus = "ringing" | "active" | "declined" | "ended" | "missed";
export type CallSessionSummary = Pick<
  CallSession,
  "id" | "conversationId" | "room" | "kind" | "status" | "expiresAt" | "answeredAt" | "endedAt" | "createdAt"
> & {
  direction: "incoming" | "outgoing";
  peer: PublicProfile;
};

export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user.id,
    username: user.username ?? user.openId.replace(/^local:/, ""),
    displayName: user.name ?? user.username ?? "Người dùng ChatPHT",
  };
}

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại sau.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["username", "name", "email", "passwordHash", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field];
      updateSet[field] = user[field];
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function upsertPushDevice(input: {
  userId: number;
  token: string;
  platform: "ios" | "android";
}) {
  const db = requireDb(await getDb());
  const now = new Date();
  await db.insert(pushDevices).values({ ...input, enabled: true, lastSeenAt: now }).onDuplicateKeyUpdate({
    set: { userId: input.userId, platform: input.platform, enabled: true, lastSeenAt: now },
  });
}

export async function removePushDevice(userId: number, token: string) {
  const db = requireDb(await getDb());
  await db.delete(pushDevices).where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)));
}

export async function listConversationRecipientDevices(conversationId: number, senderId: number) {
  const db = requireDb(await getDb());
  const recipients = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, senderId)));
  if (!recipients.length) return [];

  const devices = await Promise.all(
    recipients.map(({ userId }) =>
      db
        .select({ token: pushDevices.token, platform: pushDevices.platform })
        .from(pushDevices)
        .where(and(eq(pushDevices.userId, userId), eq(pushDevices.enabled, true))),
    ),
  );
  return devices.flat();
}

export async function createLocalUser(input: {
  username: string;
  displayName: string;
  passwordHash: string;
}) {
  const db = requireDb(await getDb());
  await db.insert(users).values({
    openId: `local:${input.username}`,
    username: input.username,
    name: input.displayName,
    passwordHash: input.passwordHash,
    loginMethod: "username",
    lastSignedIn: new Date(),
  });
  const user = await getUserByUsername(input.username);
  if (!user) throw new Error("Không thể tạo tài khoản.");
  return user;
}

export async function touchUser(id: number) {
  const db = requireDb(await getDb());
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function searchProfiles(query: string, currentUserId: number) {
  const db = requireDb(await getDb());
  const result = await db
    .select()
    .from(users)
    .where(and(like(users.username, `%${query}%`), ne(users.id, currentUserId)))
    .limit(20);
  return result.filter((user) => user.username).map(toPublicProfile);
}

export async function getFriendship(firstUserId: number, secondUserId: number) {
  const db = requireDb(await getDb());
  const result = await db
    .select()
    .from(friendRequests)
    .where(
      or(
        and(eq(friendRequests.senderId, firstUserId), eq(friendRequests.recipientId, secondUserId)),
        and(eq(friendRequests.senderId, secondUserId), eq(friendRequests.recipientId, firstUserId)),
      ),
    )
    .limit(1);
  return result[0];
}

export async function sendFriendRequest(senderId: number, recipientId: number) {
  const db = requireDb(await getDb());
  await db.insert(friendRequests).values({ senderId, recipientId, status: "pending" });
}

async function hydrateFriendRequest(request: typeof friendRequests.$inferSelect, requesterIsSender: boolean) {
  const counterpart = await getUserById(requesterIsSender ? request.recipientId : request.senderId);
  if (!counterpart) throw new Error("Không tìm thấy người dùng trong lời mời kết bạn.");
  return { ...request, user: toPublicProfile(counterpart) };
}

export async function listIncomingFriendRequests(userId: number) {
  const db = requireDb(await getDb());
  const requests = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.recipientId, userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.createdAt));
  return Promise.all(requests.map((request) => hydrateFriendRequest(request, false)));
}

export async function listContacts(userId: number) {
  const db = requireDb(await getDb());
  const requests = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.status, "accepted"),
        or(eq(friendRequests.senderId, userId), eq(friendRequests.recipientId, userId)),
      ),
    )
    .orderBy(desc(friendRequests.updatedAt));
  const contacts = await Promise.all(
    requests.map(async (request) => {
      const otherUserId = request.senderId === userId ? request.recipientId : request.senderId;
      const user = await getUserById(otherUserId);
      return user ? toPublicProfile(user) : null;
    }),
  );
  return contacts.filter((contact): contact is PublicProfile => Boolean(contact));
}

export async function respondToFriendRequest(requestId: number, recipientId: number, accepted: boolean) {
  const db = requireDb(await getDb());
  const request = (
    await db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.recipientId, recipientId)))
      .limit(1)
  )[0];
  if (!request || request.status !== "pending") return undefined;
  await db
    .update(friendRequests)
    .set({ status: accepted ? "accepted" : "declined" })
    .where(eq(friendRequests.id, requestId));
  return { ...request, status: accepted ? ("accepted" as const) : ("declined" as const) };
}

function directKey(firstUserId: number, secondUserId: number) {
  return [firstUserId, secondUserId].sort((a, b) => a - b).join(":");
}

export async function getOrCreateDirectConversation(firstUserId: number, secondUserId: number) {
  const db = requireDb(await getDb());
  const key = directKey(firstUserId, secondUserId);
  let conversation = (await db.select().from(conversations).where(eq(conversations.directKey, key)).limit(1))[0];
  if (!conversation) {
    await db.insert(conversations).values({ directKey: key });
    conversation = (await db.select().from(conversations).where(eq(conversations.directKey, key)).limit(1))[0];
    if (!conversation) throw new Error("Không thể tạo hội thoại.");
    await db.insert(conversationMembers).values([
      { conversationId: conversation.id, userId: firstUserId },
      { conversationId: conversation.id, userId: secondUserId },
    ]);
  }
  return conversation;
}

export async function restoreConversationForUser(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  await db
    .update(conversationMembers)
    .set({ hiddenAt: null })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}

export async function hideConversationForUser(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, userId))) {
    throw new Error("Bạn không có quyền xóa hội thoại này.");
  }
  await db
    .update(conversationMembers)
    .set({ hiddenAt: new Date() })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}

/** Marks all conversations as delivered after the authenticated user opens ChatPHT. */
export async function markAllConversationsDelivered(userId: number) {
  const db = requireDb(await getDb());
  await db
    .update(conversationMembers)
    .set({ lastDeliveredAt: new Date() })
    .where(eq(conversationMembers.userId, userId));
}

/** Marks incoming messages as delivered and read only after their conversation becomes visible. */
export async function markConversationRead(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, userId))) {
    throw new Error("Bạn không có quyền cập nhật trạng thái hội thoại này.");
  }
  const now = new Date();
  await db
    .update(conversationMembers)
    .set({ lastDeliveredAt: now, lastReadAt: now })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}

/** Stores a short-lived typing heartbeat only for the authenticated conversation member. */
export async function setConversationTyping(conversationId: number, userId: number, isTyping: boolean) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, userId))) {
    throw new Error("Bạn không có quyền cập nhật trạng thái hội thoại này.");
  }
  const typingUntil = isTyping ? new Date(Date.now() + 5_000) : null;
  await db
    .update(conversationMembers)
    .set({ typingUntil })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  return { typingUntil };
}

/** Returns only the other member's non-expired typing heartbeat for a private conversation. */
export async function getConversationTypingStatus(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, userId))) {
    throw new Error("Bạn không có quyền xem trạng thái hội thoại này.");
  }
  const peer = (
    await db
      .select({ typingUntil: conversationMembers.typingUntil })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, userId)))
      .limit(1)
  )[0];
  const typingUntil = peer?.typingUntil && peer.typingUntil.getTime() > Date.now() ? peer.typingUntil : null;
  return { isTyping: Boolean(typingUntil), typingUntil };
}

export async function isConversationMember(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  const membership = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  return membership.length > 0;
}

export async function getConversationPeer(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  const membership = await isConversationMember(conversationId, userId);
  if (!membership) return undefined;
  const peerMembership = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), ne(conversationMembers.userId, userId)))
    .limit(1);
  if (!peerMembership[0]) return undefined;
  const peer = await getUserById(peerMembership[0].userId);
  return peer ? toPublicProfile(peer) : undefined;
}

function toCallSessionSummary(call: CallSession, userId: number, peer: PublicProfile): CallSessionSummary {
  return {
    id: call.id,
    conversationId: call.conversationId,
    room: call.room,
    kind: call.kind,
    status: call.status,
    expiresAt: call.expiresAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    createdAt: call.createdAt,
    direction: call.callerId === userId ? "outgoing" : "incoming",
    peer,
  };
}

async function hydrateCallSession(call: CallSession, userId: number) {
  const peerUser = await getUserById(call.callerId === userId ? call.recipientId : call.callerId);
  if (!peerUser) throw new Error("Không tìm thấy người dùng của cuộc gọi.");
  return toCallSessionSummary(call, userId, toPublicProfile(peerUser));
}

export async function createCallSession(conversationId: number, callerId: number, kind: CallKind) {
  const peer = await getConversationPeer(conversationId, callerId);
  if (!peer) throw new Error("Bạn không có quyền gọi trong hội thoại này.");

  const db = requireDb(await getDb());
  const now = new Date();
  await db
    .update(callSessions)
    .set({ status: "missed", endedAt: now })
    .where(and(eq(callSessions.recipientId, peer.id), eq(callSessions.status, "ringing")));

  const id = randomUUID();
  await db.insert(callSessions).values({
    id,
    conversationId,
    callerId,
    recipientId: peer.id,
    room: `chatpht-call-${id}`,
    kind,
    status: "ringing",
    expiresAt: new Date(now.getTime() + 60_000),
  });
  const created = (await db.select().from(callSessions).where(eq(callSessions.id, id)).limit(1))[0];
  if (!created) throw new Error("Không thể tạo phiên gọi.");
  return toCallSessionSummary(created, callerId, peer);
}

export async function getCallSession(sessionId: string, userId: number) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!call || (call.callerId !== userId && call.recipientId !== userId)) return undefined;
  return hydrateCallSession(call, userId);
}

export async function getIncomingCallSession(userId: number) {
  const db = requireDb(await getDb());
  const call = (
    await db
      .select()
      .from(callSessions)
      .where(and(eq(callSessions.recipientId, userId), eq(callSessions.status, "ringing")))
      .orderBy(desc(callSessions.createdAt))
      .limit(1)
  )[0];
  if (!call) return undefined;
  if (call.expiresAt.getTime() <= Date.now()) {
    await db.update(callSessions).set({ status: "missed", endedAt: new Date() }).where(eq(callSessions.id, call.id));
    return undefined;
  }
  return hydrateCallSession(call, userId);
}

export async function answerCallSession(sessionId: string, userId: number) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!call || call.recipientId !== userId || call.status !== "ringing") throw new Error("Cuộc gọi này không còn chờ phản hồi.");
  if (call.expiresAt.getTime() <= Date.now()) {
    await db.update(callSessions).set({ status: "missed", endedAt: new Date() }).where(eq(callSessions.id, sessionId));
    throw new Error("Cuộc gọi đã hết thời gian chờ.");
  }
  const answeredAt = new Date();
  await db.update(callSessions).set({ status: "active", answeredAt }).where(eq(callSessions.id, sessionId));
  const updated = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!updated) throw new Error("Không thể nhận cuộc gọi.");
  return hydrateCallSession(updated, userId);
}

export async function finishCallSession(sessionId: string, userId: number, status: Extract<CallStatus, "declined" | "ended">) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!call || (call.callerId !== userId && call.recipientId !== userId)) throw new Error("Bạn không có quyền cập nhật cuộc gọi này.");
  await db.update(callSessions).set({ status, endedAt: new Date() }).where(eq(callSessions.id, sessionId));
}

export async function getJoinableCallSession(sessionId: string, userId: number) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!call || (call.callerId !== userId && call.recipientId !== userId)) throw new Error("Bạn không có quyền tham gia cuộc gọi này.");
  if (call.status === "ringing" && call.callerId !== userId) throw new Error("Hãy nhận cuộc gọi trước khi tham gia.");
  if (call.status !== "ringing" && call.status !== "active") throw new Error("Cuộc gọi đã kết thúc.");
  if (call.status === "ringing" && call.expiresAt.getTime() <= Date.now()) throw new Error("Cuộc gọi đã hết thời gian chờ.");
  return call;
}

export async function listConversations(userId: number) {
  const db = requireDb(await getDb());
  const memberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const items = await Promise.all(
    memberships.filter((membership) => !membership.hiddenAt).map(async (membership) => {
      const peer = await getConversationPeer(membership.conversationId, userId);
      const latestMessage = (
        await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, membership.conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(1)
      )[0];
      return peer
        ? { id: membership.conversationId, peer, latestMessage: latestMessage ?? null }
        : null;
    }),
  );
  return items
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (first, second) =>
        (second.latestMessage?.createdAt?.getTime() ?? 0) - (first.latestMessage?.createdAt?.getTime() ?? 0),
  );
}

export async function listMessages(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, userId))) throw new Error("Bạn không có quyền xem hội thoại này.");
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(60);
  const messageIds = result.map((message) => message.id);
  const reactionRows = messageIds.length
    ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds))
    : [];
  const members = await db
    .select({
      userId: conversationMembers.userId,
      lastDeliveredAt: conversationMembers.lastDeliveredAt,
      lastReadAt: conversationMembers.lastReadAt,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  const recipient = members.find((member) => member.userId !== userId);
  const reactionsByMessage = new Map<number, Array<{ emoji: string; userId: number }>>();
  for (const reaction of reactionRows) {
    const existing = reactionsByMessage.get(reaction.messageId) ?? [];
    existing.push({ emoji: reaction.emoji, userId: reaction.userId });
    reactionsByMessage.set(reaction.messageId, existing);
  }
  return result.reverse().map((message) => ({
    ...message,
    reactions: reactionsByMessage.get(message.id) ?? [],
    recipientDeliveredAt: message.senderId === userId ? recipient?.lastDeliveredAt ?? null : null,
    recipientReadAt: message.senderId === userId ? recipient?.lastReadAt ?? null : null,
  }));
}

/**
 * Removes every message visible to both members and returns the associated media keys
 * so the caller can also clear the private object-store payloads.
 */
export async function clearConversationContent(conversationId: number, requesterId: number) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, requesterId))) {
    throw new Error("Bạn không có quyền xóa sạch hội thoại này.");
  }

  const messageRows = await db
    .select({ id: messages.id, mediaKey: messages.mediaKey })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  const mediaKeys = Array.from(
    new Set(
      messageRows
        .map(({ mediaKey }) => mediaKey)
        .filter((mediaKey): mediaKey is string => Boolean(mediaKey)),
    ),
  );

  const messageIds = messageRows.map((message) => message.id);
  if (messageIds.length) {
    await db.delete(messageReactions).where(inArray(messageReactions.messageId, messageIds));
  }
  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  await db
    .update(conversationMembers)
    .set({ hiddenAt: null })
    .where(eq(conversationMembers.conversationId, conversationId));

  return { mediaKeys, messagesDeleted: messageRows.length };
}

export async function createMessage(input: {
  conversationId: number;
  senderId: number;
  body?: string | null;
  contentType: "text" | "image" | "video";
  mediaKey?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
}) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(input.conversationId, input.senderId))) {
    throw new Error("Bạn không có quyền gửi tin trong hội thoại này.");
  }
  await db
    .update(conversationMembers)
    .set({ hiddenAt: null })
    .where(eq(conversationMembers.conversationId, input.conversationId));
  await db.insert(messages).values(input);
  const message = (
    await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, input.conversationId), eq(messages.senderId, input.senderId)))
      .orderBy(desc(messages.id))
      .limit(1)
  )[0];
  if (!message) throw new Error("Không thể lưu tin nhắn.");
  return message;
}

export async function recallMessage(messageId: number, senderId: number) {
  const db = requireDb(await getDb());
  const message = (
    await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.senderId, senderId)))
      .limit(1)
  )[0];
  if (!message) throw new Error("Bạn chỉ có thể thu hồi tin nhắn do mình gửi.");
  if (message.recalledAt) return message;
  await db.delete(messageReactions).where(eq(messageReactions.messageId, messageId));
  await db
    .update(messages)
    .set({
      body: null,
      mediaKey: null,
      mediaMime: null,
      mediaName: null,
      mediaSize: null,
      recalledAt: new Date(),
      recalledBy: senderId,
    })
    .where(eq(messages.id, messageId));
  const recalled = (await db.select().from(messages).where(eq(messages.id, messageId)).limit(1))[0];
  if (!recalled) throw new Error("Không thể thu hồi tin nhắn.");
  return recalled;
}

export async function toggleMessageReaction(input: {
  messageId: number;
  userId: number;
  emoji: string;
}) {
  const db = requireDb(await getDb());
  const message = (await db.select().from(messages).where(eq(messages.id, input.messageId)).limit(1))[0];
  if (!message) throw new Error("Tin nhắn không còn tồn tại.");
  if (message.recalledAt) throw new Error("Không thể thả cảm xúc vào tin nhắn đã thu hồi.");
  if (!(await isConversationMember(message.conversationId, input.userId))) {
    throw new Error("Bạn không có quyền tương tác với tin nhắn này.");
  }

  const existing = (
    await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, input.messageId),
          eq(messageReactions.userId, input.userId),
          eq(messageReactions.emoji, input.emoji),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
    return { conversationId: message.conversationId, active: false as const };
  }

  await db.insert(messageReactions).values({
    messageId: input.messageId,
    userId: input.userId,
    emoji: input.emoji,
  });
  return { conversationId: message.conversationId, active: true as const };
}
