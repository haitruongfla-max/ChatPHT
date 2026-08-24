import { and, desc, eq, inArray, isNotNull, isNull, like, lt, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import {
  callSessions,
  conversationMembers,
  conversations,
  friendRequests,
  messageReactions,
  messages,
  p2pSignals,
  pushDevices,
  storageSettings,
  type CallSession,
  type InsertUser,
  type User,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { DEFAULT_STORAGE_QUOTA_GB, quotaGbToBytes } from "../lib/storage-usage";

export type PublicProfile = {
  id: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  accessExpiresAt: Date | null;
};

export type CallKind = "audio" | "video";
export type P2pCallMode = "audio" | "video" | "screen";
export type CallStatus = "ringing" | "active" | "declined" | "ended" | "missed";
export type P2pSignalType = "offer" | "answer" | "ice" | "screen-start" | "screen-stop";
// Android may need time to surface a full-screen incoming call and request media permissions.
export const P2P_RING_TIMEOUT_MS = 180_000;

export function isIdempotentP2pAnswerStatus(status: CallStatus) {
  return status === "active";
}

export type CallSessionSummary = Pick<
  CallSession,
  "id" | "conversationId" | "room" | "kind" | "p2pMode" | "provider" | "isGroup" | "status" | "expiresAt" | "answeredAt" | "endedAt" | "createdAt"
> & {
  direction: "incoming" | "outgoing";
  isCaller: boolean;
  peer: PublicProfile | null;
  group: { title: string; participantCount: number } | null;
};

export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user.id,
    username: user.username ?? user.openId.replace(/^local:/, ""),
    displayName: user.name ?? user.username ?? "Người dùng ChatPHT",
    avatarUrl: user.avatarKey ? `/manus-storage/${user.avatarKey}` : null,
    role: user.role,
    accessExpiresAt: user.accessExpiresAt,
  };
}

export function isUserAccessExpired(user: Pick<User, "role" | "accessExpiresAt">, now = new Date()) {
  return user.role !== "admin" && Boolean(user.accessExpiresAt && user.accessExpiresAt.getTime() <= now.getTime());
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

export async function updateOwnProfile(input: { userId: number; displayName: string; avatarKey?: string | null }) {
  const db = requireDb(await getDb());
  const current = await getUserById(input.userId);
  if (!current) throw new Error("Tài khoản không còn tồn tại.");

  const update: { name: string; avatarKey?: string | null } = { name: input.displayName };
  if (input.avatarKey !== undefined) update.avatarKey = input.avatarKey;
  await db.update(users).set(update).where(eq(users.id, input.userId));

  const updated = await getUserById(input.userId);
  if (!updated) throw new Error("Không thể cập nhật hồ sơ.");
  return {
    profile: toPublicProfile(updated),
    replacedAvatarKey:
      input.avatarKey !== undefined && current.avatarKey && current.avatarKey !== input.avatarKey
        ? current.avatarKey
        : null,
  };
}

export async function listManagedUsers() {
  const db = requireDb(await getDb());
  const result = await db.select().from(users).orderBy(desc(users.createdAt));
  return result.map((user) => ({
    ...toPublicProfile(user),
    createdAt: user.createdAt,
    lastSignedIn: user.lastSignedIn,
    isExpired: isUserAccessExpired(user),
  }));
}

export async function getStorageQuotaSettings() {
  const db = requireDb(await getDb());
  const [settings] = await db.select().from(storageSettings).where(eq(storageSettings.id, 1)).limit(1);
  return {
    quotaGb: settings?.quotaGb ?? DEFAULT_STORAGE_QUOTA_GB,
    unlimited: settings?.unlimited ?? false,
    scheduledTaskUid: settings?.scheduledTaskUid ?? null,
    lastCleanupAt: settings?.lastCleanupAt ?? null,
  };
}

export async function updateStorageQuotaSettings(input: { quotaGb: number; unlimited: boolean }) {
  const db = requireDb(await getDb());
  const [settings] = await db.select().from(storageSettings).where(eq(storageSettings.id, 1)).limit(1);
  if (settings) {
    await db.update(storageSettings).set(input).where(eq(storageSettings.id, 1));
  } else {
    await db.insert(storageSettings).values({ id: 1, ...input });
  }
  return getStorageQuotaSettings();
}

export async function setStorageCleanupTaskUid(taskUid: string | null) {
  const db = requireDb(await getDb());
  await db.update(storageSettings).set({ scheduledTaskUid: taskUid }).where(eq(storageSettings.id, 1));
}

export async function markStorageCleanupRan() {
  const db = requireDb(await getDb());
  await db.update(storageSettings).set({ lastCleanupAt: new Date() }).where(eq(storageSettings.id, 1));
}

const activeMediaFilter = and(
  isNotNull(messages.mediaKey),
  isNull(messages.mediaCleanedAt),
  inArray(messages.contentType, ["image", "video"]),
);

/** Totals completed chat media tracked by the application database. */
export async function getStorageUsageSummary() {
  const db = requireDb(await getDb());
  const settings = await getStorageQuotaSettings();
  const [mediaAggregate] = await db
    .select({
      usedBytes: sql<number>`coalesce(sum(${messages.mediaSize}), 0)`,
      mediaCount: sql<number>`count(${messages.id})`,
    })
    .from(messages)
    .where(activeMediaFilter);
  const [backgroundAggregate] = await db
    .select({
      usedBytes: sql<number>`coalesce(sum(${conversations.backgroundSize}), 0)`,
      mediaCount: sql<number>`count(${conversations.id})`,
    })
    .from(conversations)
    .where(isNotNull(conversations.backgroundKey));
  const recentMedia = await db
    .select({
      id: messages.id,
      contentType: messages.contentType,
      mediaName: messages.mediaName,
      mediaSize: messages.mediaSize,
      createdAt: messages.createdAt,
      senderName: users.name,
      senderUsername: users.username,
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(activeMediaFilter)
    .orderBy(desc(messages.createdAt))
    .limit(5);

  return {
    usedBytes: Number(mediaAggregate?.usedBytes ?? 0) + Number(backgroundAggregate?.usedBytes ?? 0),
    mediaCount: Number(mediaAggregate?.mediaCount ?? 0) + Number(backgroundAggregate?.mediaCount ?? 0),
    quotaGb: settings.quotaGb,
    quotaBytes: settings.unlimited ? null : quotaGbToBytes(settings.quotaGb),
    unlimited: settings.unlimited,
    lastCleanupAt: settings.lastCleanupAt,
    recentMedia: recentMedia.map((media) => ({
      ...media,
      mediaSize: media.mediaSize ?? 0,
      senderName: media.senderName ?? media.senderUsername ?? "Người dùng ChatPHT",
    })),
  };
}

export async function listActiveMediaForCleanup() {
  const db = requireDb(await getDb());
  return db.select({
    id: messages.id,
    mediaKey: messages.mediaKey,
    mediaSize: messages.mediaSize,
    createdAt: messages.createdAt,
  }).from(messages).where(activeMediaFilter).orderBy(messages.createdAt);
}

export async function markMessageMediaCleaned(messageId: number) {
  const db = requireDb(await getDb());
  await db.update(messages).set({
    mediaKey: null,
    mediaMime: null,
    mediaName: null,
    mediaSize: null,
    mediaCleanedAt: new Date(),
  }).where(and(eq(messages.id, messageId), isNull(messages.mediaCleanedAt)));
}

export async function setUserAccessExpiry(userId: number, accessExpiresAt: Date | null) {
  const db = requireDb(await getDb());
  const user = await getUserById(userId);
  if (!user) throw new Error("Tài khoản không còn tồn tại.");
  if (user.role === "admin") throw new Error("Không thể thay đổi thời hạn của quản trị viên.");
  await db.update(users).set({ accessExpiresAt }).where(eq(users.id, userId));
  const updated = await getUserById(userId);
  if (!updated) throw new Error("Không thể cập nhật thời hạn sử dụng.");
  return {
    ...toPublicProfile(updated),
    createdAt: updated.createdAt,
    lastSignedIn: updated.lastSignedIn,
    isExpired: isUserAccessExpired(updated),
  };
}

/**
 * Removes a standard account and its owned messages, media references, sessions,
 * device tokens and social links. Media bytes are returned for storage cleanup.
 */
export async function deleteManagedUser(userId: number) {
  const db = requireDb(await getDb());
  const user = await getUserById(userId);
  if (!user) throw new Error("Tài khoản không còn tồn tại.");
  if (user.role === "admin") throw new Error("Không thể xóa tài khoản quản trị viên.");

  const sentMessages = await db
    .select({ id: messages.id, mediaKey: messages.mediaKey })
    .from(messages)
    .where(eq(messages.senderId, userId));
  const mediaKeys = Array.from(
    new Set([
      ...sentMessages.map((message) => message.mediaKey).filter((key): key is string => Boolean(key)),
      ...(user.avatarKey ? [user.avatarKey] : []),
    ]),
  );
  const messageIds = sentMessages.map((message) => message.id);
  const memberRows = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const conversationIds = memberRows.map((row) => row.conversationId);

  if (messageIds.length) await db.delete(messageReactions).where(inArray(messageReactions.messageId, messageIds));
  await db.delete(messages).where(eq(messages.senderId, userId));
  await db.delete(callSessions).where(or(eq(callSessions.callerId, userId), eq(callSessions.recipientId, userId)));
  await db.delete(pushDevices).where(eq(pushDevices.userId, userId));
  await db.delete(friendRequests).where(or(eq(friendRequests.senderId, userId), eq(friendRequests.recipientId, userId)));
  await db.delete(conversationMembers).where(eq(conversationMembers.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  for (const conversationId of conversationIds) {
    const remainingMembers = await db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
      .limit(1);
    if (!remainingMembers.length) await db.delete(conversations).where(eq(conversations.id, conversationId));
  }

  return { username: user.username ?? user.openId, mediaKeys };
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

export type GroupConversationSummary = {
  id: number;
  kind: "group";
  title: string;
  avatarKey: string | null;
  createdBy: number | null;
  pinnedMessageId: number | null;
  memberCount: number;
};

async function requireGroupRole(conversationId: number, userId: number, allowed: Array<"owner" | "admin">) {
  const db = requireDb(await getDb());
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation || conversation.kind !== "group") throw new Error("Không tìm thấy nhóm trò chuyện.");
  const [membership] = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin") || !allowed.includes(membership.role)) {
    throw new Error("Chỉ quản trị viên nhóm mới có quyền thực hiện thao tác này.");
  }
  return conversation;
}

export async function createGroupConversation(input: { creatorId: number; title: string; memberIds: number[]; avatarKey?: string | null }) {
  const db = requireDb(await getDb());
  const normalizedIds = Array.from(new Set([input.creatorId, ...input.memberIds]));
  if (normalizedIds.length < 2) throw new Error("Nhóm cần ít nhất hai thành viên.");
  if (normalizedIds.length > 50) throw new Error("Mỗi nhóm tối đa 50 thành viên.");
  const selectedUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, normalizedIds));
  if (selectedUsers.length !== normalizedIds.length) throw new Error("Một hoặc nhiều thành viên không còn tồn tại.");

  await db.insert(conversations).values({
    directKey: null,
    kind: "group",
    title: input.title,
    avatarKey: input.avatarKey ?? null,
    createdBy: input.creatorId,
  });
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.createdBy, input.creatorId), eq(conversations.kind, "group"), eq(conversations.title, input.title)))
    .orderBy(desc(conversations.id))
    .limit(1);
  if (!conversation) throw new Error("Không thể tạo nhóm.");
  await db.insert(conversationMembers).values(
    normalizedIds.map((userId) => ({
      conversationId: conversation.id,
      userId,
      role: userId === input.creatorId ? "owner" as const : "member" as const,
    })),
  );
  return getGroupConversationSummary(conversation.id, input.creatorId);
}

export async function getGroupConversationSummary(conversationId: number, userId: number): Promise<GroupConversationSummary> {
  const db = requireDb(await getDb());
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation || conversation.kind !== "group" || !(await isConversationMember(conversationId, userId))) {
    throw new Error("Bạn không có quyền truy cập nhóm này.");
  }
  const members = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return {
    id: conversation.id,
    kind: "group",
    title: conversation.title ?? "Nhóm ChatPHT",
    avatarKey: conversation.avatarKey,
    createdBy: conversation.createdBy,
    pinnedMessageId: conversation.pinnedMessageId,
    memberCount: members.length,
  };
}

export async function listGroupMembers(conversationId: number, requesterId: number) {
  const db = requireDb(await getDb());
  await getGroupConversationSummary(conversationId, requesterId);
  const rows = await db
    .select({ userId: conversationMembers.userId, role: conversationMembers.role })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  const hydrated = await Promise.all(rows.map(async (row) => {
    const user = await getUserById(row.userId);
    return user ? { ...toPublicProfile(user), groupRole: row.role } : null;
  }));
  return hydrated.filter((member): member is NonNullable<typeof member> => Boolean(member));
}

export async function updateGroupConversation(input: { conversationId: number; requesterId: number; title?: string; avatarKey?: string | null }) {
  const db = requireDb(await getDb());
  await requireGroupRole(input.conversationId, input.requesterId, ["owner", "admin"]);
  const update: { title?: string; avatarKey?: string | null } = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.avatarKey !== undefined) update.avatarKey = input.avatarKey;
  if (!Object.keys(update).length) throw new Error("Không có thay đổi nào cho nhóm.");
  await db.update(conversations).set(update).where(eq(conversations.id, input.conversationId));
  return getGroupConversationSummary(input.conversationId, input.requesterId);
}

export async function addGroupMembers(input: { conversationId: number; requesterId: number; userIds: number[] }) {
  const db = requireDb(await getDb());
  await requireGroupRole(input.conversationId, input.requesterId, ["owner", "admin"]);
  const userIds = Array.from(new Set(input.userIds)).filter((id) => id !== input.requesterId);
  if (!userIds.length) throw new Error("Hãy chọn ít nhất một thành viên.");
  const existing = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, input.conversationId));
  const existingIds = new Set(existing.map((member) => member.userId));
  const missingIds = userIds.filter((id) => !existingIds.has(id));
  if (existing.length + missingIds.length > 50) throw new Error("Mỗi nhóm tối đa 50 thành viên.");
  const found = missingIds.length ? await db.select({ id: users.id }).from(users).where(inArray(users.id, missingIds)) : [];
  if (found.length !== missingIds.length) throw new Error("Một hoặc nhiều thành viên không còn tồn tại.");
  if (missingIds.length) await db.insert(conversationMembers).values(missingIds.map((userId) => ({ conversationId: input.conversationId, userId, role: "member" as const })));
  return listGroupMembers(input.conversationId, input.requesterId);
}

export async function removeGroupMember(input: { conversationId: number; requesterId: number; userId: number }) {
  const db = requireDb(await getDb());
  await requireGroupRole(input.conversationId, input.requesterId, ["owner", "admin"]);
  const [target] = await db.select({ role: conversationMembers.role }).from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, input.userId))).limit(1);
  if (!target) throw new Error("Thành viên không còn trong nhóm.");
  if (target.role === "owner") throw new Error("Không thể xóa người tạo nhóm.");
  await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, input.userId)));
  return { success: true as const };
}

export async function updateGroupMemberRole(input: { conversationId: number; requesterId: number; userId: number; role: "admin" | "member" }) {
  const db = requireDb(await getDb());
  await requireGroupRole(input.conversationId, input.requesterId, ["owner"]);
  const [target] = await db.select({ role: conversationMembers.role }).from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, input.userId))).limit(1);
  if (!target) throw new Error("Thành viên không còn trong nhóm.");
  if (target.role === "owner") throw new Error("Không thể thay đổi vai trò người tạo nhóm.");
  await db.update(conversationMembers).set({ role: input.role }).where(and(
    eq(conversationMembers.conversationId, input.conversationId),
    eq(conversationMembers.userId, input.userId),
  ));
  return listGroupMembers(input.conversationId, input.requesterId);
}

export async function pinGroupMessage(input: { conversationId: number; requesterId: number; messageId: number | null }) {
  const db = requireDb(await getDb());
  await requireGroupRole(input.conversationId, input.requesterId, ["owner", "admin"]);
  if (input.messageId !== null) {
    const [message] = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.id, input.messageId), eq(messages.conversationId, input.conversationId))).limit(1);
    if (!message) throw new Error("Tin nhắn không thuộc nhóm này.");
  }
  await db.update(conversations).set({ pinnedMessageId: input.messageId }).where(eq(conversations.id, input.conversationId));
  return getGroupConversationSummary(input.conversationId, input.requesterId);
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

/** Returns the shared conversation background after verifying current membership. */
export async function getConversationWallpaperKey(conversationId: number, userId: number) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(conversationId, userId))) {
    throw new Error("Bạn không có quyền truy cập hội thoại này.");
  }
  const conversation = await db
    .select({
      wallpaperKey: conversations.backgroundKey,
      wallpaperSize: conversations.backgroundSize,
      wallpaperOpacity: conversations.backgroundOpacity,
      backgroundUpdatedAt: conversations.backgroundUpdatedAt,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation[0]) throw new Error("Hội thoại không còn tồn tại.");
  // A non-null timestamp means this conversation has explicitly opted into the
  // shared model, even when the current shared background was cleared.
  if (conversation[0].backgroundUpdatedAt) return conversation[0];
  const [legacyMemberBackground] = await db
    .select({
      wallpaperKey: conversationMembers.wallpaperKey,
      wallpaperOpacity: conversationMembers.wallpaperOpacity,
    })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!legacyMemberBackground?.wallpaperKey) return conversation[0];
  return {
    wallpaperKey: legacyMemberBackground.wallpaperKey,
    wallpaperSize: null,
    wallpaperOpacity: legacyMemberBackground.wallpaperOpacity,
    backgroundUpdatedAt: null,
  };
}

/** Stores one shared background for every current member of the conversation. */
export async function setConversationWallpaperKey(
  conversationId: number,
  userId: number,
  wallpaperKey: string | null,
  wallpaperOpacity?: number,
  wallpaperSize?: number,
) {
  const db = requireDb(await getDb());
  const previous = await getConversationWallpaperKey(conversationId, userId);
  const nextOpacity = wallpaperOpacity ?? previous.wallpaperOpacity;
  await db
    .update(conversations)
    .set({
      backgroundKey: wallpaperKey,
      backgroundSize: wallpaperKey ? wallpaperSize ?? 0 : null,
      backgroundOpacity: nextOpacity,
      backgroundUpdatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
  return {
    previousKey: previous.wallpaperKey,
    wallpaperKey,
    wallpaperSize: wallpaperKey ? wallpaperSize ?? 0 : null,
    wallpaperOpacity: nextOpacity,
    backgroundUpdatedAt: new Date(),
  };
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

/** Chỉ xác nhận object media còn hiệu lực nếu người yêu cầu là thành viên hội thoại sở hữu nó. */
export async function findAuthorizedConversationMedia(mediaKey: string, userId: number) {
  const db = requireDb(await getDb());
  const message = (
    await db
      .select({ conversationId: messages.conversationId, mediaMime: messages.mediaMime })
      .from(messages)
      .where(and(eq(messages.mediaKey, mediaKey), isNull(messages.recalledAt), isNull(messages.mediaCleanedAt)))
      .limit(1)
  )[0];
  if (!message || !(await isConversationMember(message.conversationId, userId))) return undefined;
  return { mediaMime: message.mediaMime ?? "application/octet-stream" };
}

/** Shared backgrounds are accessible to every active member; legacy member backgrounds remain readable during upgrade. */
export async function findAuthorizedWallpaper(mediaKey: string, userId: number) {
  const db = requireDb(await getDb());
  const [sharedBackground] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.backgroundKey, mediaKey))
    .limit(1);
  if (sharedBackground && await isConversationMember(sharedBackground.id, userId)) {
    return { mediaMime: "image/jpeg" };
  }
  const wallpaper = await db
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.wallpaperKey, mediaKey)))
    .limit(1);
  return wallpaper[0] ? { mediaMime: "image/jpeg" } : undefined;
}

/** Ảnh đại diện chỉ phục vụ cho phiên đăng nhập hợp lệ; object key không được công khai qua proxy storage. */
export async function findAuthorizedAvatar(mediaKey: string) {
  const db = requireDb(await getDb());
  const avatar = await db.select({ id: users.id }).from(users).where(eq(users.avatarKey, mediaKey)).limit(1);
  return avatar[0] ? { mediaMime: "image/jpeg" } : undefined;
}

/** Avatar nhóm chỉ hiển thị cho thành viên hiện tại của chính nhóm đó. */
export async function findAuthorizedGroupAvatar(mediaKey: string, userId: number) {
  const db = requireDb(await getDb());
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.kind, "group"), eq(conversations.avatarKey, mediaKey)))
    .limit(1);
  if (!conversation || !(await isConversationMember(conversation.id, userId))) return undefined;
  return { mediaMime: "image/jpeg" };
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
    p2pMode: call.p2pMode,
    provider: call.provider,
    isGroup: false,
    status: call.status,
    expiresAt: call.expiresAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    createdAt: call.createdAt,
    direction: call.callerId === userId ? "outgoing" : "incoming",
    isCaller: call.callerId === userId,
    peer,
    group: null,
  };
}

async function hydrateCallSession(call: CallSession, userId: number): Promise<CallSessionSummary> {
  if (call.isGroup) throw new Error("Cuộc gọi nhóm cũ không còn được hỗ trợ.");
  const peerUser = await getUserById(call.callerId === userId ? call.recipientId : call.callerId);
  if (!peerUser) throw new Error("Không tìm thấy người dùng của cuộc gọi.");
  return toCallSessionSummary(call, userId, toPublicProfile(peerUser));
}

export async function createCallSession(conversationId: number, callerId: number, kind: CallKind, p2pMode: P2pCallMode) {
  const db = requireDb(await getDb());
  if ((p2pMode === "video") !== (kind === "video")) throw new Error("Chế độ P2P không khớp với loại cuộc gọi.");
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conversation || conversation.kind !== "direct") throw new Error("ChatPHT hiện chỉ hỗ trợ gọi P2P trong hội thoại 1:1.");
  const peer = await getConversationPeer(conversationId, callerId);
  if (!peer) throw new Error("Bạn không có quyền gọi trong hội thoại này.");

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
    p2pMode,
    provider: "p2p",
    status: "ringing",
    expiresAt: new Date(now.getTime() + P2P_RING_TIMEOUT_MS),
  });
  const created = (await db.select().from(callSessions).where(eq(callSessions.id, id)).limit(1))[0];
  if (!created) throw new Error("Không thể tạo phiên gọi.");
  return toCallSessionSummary(created, callerId, peer);
}

export async function getAdminOperationalStats() {
  const db = requireDb(await getDb());
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const callRows = await db.select({ provider: callSessions.provider, createdAt: callSessions.createdAt }).from(callSessions);
  const today = callRows.filter((call) => call.createdAt >= startOfToday);
  const groupRows = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.kind, "group"));
  const storage = await getStorageUsageSummary();
  return {
    storage,
    groupsCreated: groupRows.length,
    callsToday: {
      p2p: today.filter((call) => call.provider === "p2p").length,
    },
  };
}

export async function getCallSession(sessionId: string, userId: number) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!call) return undefined;
  if (call.isGroup) {
    if (!(await isConversationMember(call.conversationId, userId))) return undefined;
  } else if (call.callerId !== userId && call.recipientId !== userId) return undefined;
  return hydrateCallSession(call, userId);
}

export async function listCallSessionsByConversation(conversationId: number, userId: number, limit = 60) {
  if (!(await isConversationMember(conversationId, userId))) throw new Error("Bạn không có quyền xem lịch sử cuộc gọi này.");
  const db = requireDb(await getDb());
  const now = new Date();
  await db
    .update(callSessions)
    .set({ status: "missed", endedAt: now })
    .where(and(eq(callSessions.conversationId, conversationId), eq(callSessions.status, "ringing"), lt(callSessions.expiresAt, now)));
  const calls = await db
    .select()
    .from(callSessions)
    .where(eq(callSessions.conversationId, conversationId))
    .orderBy(desc(callSessions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return Promise.all(calls.reverse().map((call) => hydrateCallSession(call, userId)));
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
  if (!call || call.isGroup || call.recipientId !== userId) throw new Error("Cuộc gọi này không còn chờ phản hồi.");
  // Android can retry a mutation after a slow network response or surface two
  // acceptance events close together. The recipient accepting an already-active
  // direct call is safe and must not be reported as an expired/missed call.
  if (isIdempotentP2pAnswerStatus(call.status)) return hydrateCallSession(call, userId);
  if (call.status !== "ringing") throw new Error("Cuộc gọi này không còn chờ phản hồi.");
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
  if (!call) throw new Error("Bạn không có quyền cập nhật cuộc gọi này.");
  if (call.isGroup) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, call.conversationId)).limit(1);
    if (!conversation || !(await isConversationMember(call.conversationId, userId)) || (call.callerId !== userId && conversation.createdBy !== userId)) {
      throw new Error("Chỉ người tạo cuộc gọi hoặc chủ nhóm mới có thể kết thúc phòng nhóm.");
    }
  } else if (call.callerId !== userId && call.recipientId !== userId) throw new Error("Bạn không có quyền cập nhật cuộc gọi này.");
  const finalStatus: CallStatus = status === "ended" && call.status === "ringing" ? "missed" : status;
  await db.update(callSessions).set({ status: finalStatus, endedAt: new Date() }).where(eq(callSessions.id, sessionId));
}

export async function getJoinableCallSession(sessionId: string, userId: number) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (call?.isGroup) throw new Error("Hãy dùng luồng tham gia cuộc gọi nhóm.");
  if (!call || (call.callerId !== userId && call.recipientId !== userId)) throw new Error("Bạn không có quyền tham gia cuộc gọi này.");
  if (call.status === "ringing" && call.callerId !== userId) throw new Error("Hãy nhận cuộc gọi trước khi tham gia.");
  if (call.status !== "ringing" && call.status !== "active") throw new Error("Cuộc gọi đã kết thúc.");
  if (call.status === "ringing" && call.expiresAt.getTime() <= Date.now()) throw new Error("Cuộc gọi đã hết thời gian chờ.");
  return call;
}

async function getAuthorizedP2pCall(sessionId: string, userId: number) {
  const db = requireDb(await getDb());
  const call = (await db.select().from(callSessions).where(eq(callSessions.id, sessionId)).limit(1))[0];
  if (!call || call.isGroup || call.provider !== "p2p" || (call.callerId !== userId && call.recipientId !== userId)) {
    throw new Error("Bạn không có quyền gửi tín hiệu cho cuộc gọi này.");
  }
  if (call.status !== "ringing" && call.status !== "active") throw new Error("Cuộc gọi đã kết thúc.");
  if (call.status === "ringing" && call.expiresAt.getTime() <= Date.now()) {
    await db.update(callSessions).set({ status: "missed", endedAt: new Date() }).where(eq(callSessions.id, sessionId));
    throw new Error("Cuộc gọi đã hết thời gian chờ.");
  }
  return call;
}

export async function authorizeP2pIceConfig(callId: string, userId: number) {
  await getAuthorizedP2pCall(callId, userId);
}

export async function createP2pSignal({ callId, senderId, type, payload }: { callId: string; senderId: number; type: P2pSignalType; payload: string }) {
  const db = requireDb(await getDb());
  const call = await getAuthorizedP2pCall(callId, senderId);
  if ((type === "offer" && call.callerId !== senderId) || (type === "answer" && call.recipientId !== senderId)) {
    throw new Error("Loại tín hiệu không hợp lệ cho vai trò cuộc gọi này.");
  }
  const recipientId = call.callerId === senderId ? call.recipientId : call.callerId;
  await db.delete(p2pSignals).where(lt(p2pSignals.createdAt, new Date(Date.now() - 15 * 60_000)));
  const [created] = await db.insert(p2pSignals).values({ callId, senderId, recipientId, type, payload }).$returningId();
  return { id: created?.id ?? null, recipientId };
}

export async function drainP2pSignals(callId: string, userId: number) {
  const db = requireDb(await getDb());
  await getAuthorizedP2pCall(callId, userId);
  const pending = await db.select().from(p2pSignals).where(and(eq(p2pSignals.callId, callId), eq(p2pSignals.recipientId, userId))).orderBy(p2pSignals.id).limit(100);
  if (pending.length) await db.delete(p2pSignals).where(inArray(p2pSignals.id, pending.map((signal) => signal.id)));
  return pending.map((signal) => ({ id: signal.id, senderId: signal.senderId, type: signal.type, payload: signal.payload, createdAt: signal.createdAt }));
}

export async function listConversations(userId: number) {
  const db = requireDb(await getDb());
  const memberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const items = await Promise.all(
    memberships.filter((membership) => !membership.hiddenAt).map(async (membership) => {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, membership.conversationId)).limit(1);
      if (!conversation) return null;
      const peer = await getConversationPeer(membership.conversationId, userId);
      const latestMessage = (
        await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, membership.conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(1)
      )[0];
      if (conversation.kind === "group") {
        const memberCount = await db
          .select({ id: conversationMembers.id })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, membership.conversationId));
        return {
          id: membership.conversationId,
          group: {
            title: conversation.title ?? "Nhóm ChatPHT",
            avatarKey: conversation.avatarKey,
            memberCount: memberCount.length,
          },
          latestMessage: latestMessage ?? null,
        };
      }
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
  const replyIds = Array.from(new Set(result.map((message) => message.replyToMessageId).filter((id): id is number => typeof id === "number")));
  const reactionRows = messageIds.length
    ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds))
    : [];
  const replyRows = replyIds.length
    ? await db.select({
      id: messages.id,
      senderId: messages.senderId,
      body: messages.body,
      contentType: messages.contentType,
      mediaName: messages.mediaName,
      recalledAt: messages.recalledAt,
    }).from(messages).where(and(eq(messages.conversationId, conversationId), inArray(messages.id, replyIds)))
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
  const repliesById = new Map(replyRows.map((message) => [message.id, message]));
  for (const reaction of reactionRows) {
    const existing = reactionsByMessage.get(reaction.messageId) ?? [];
    existing.push({ emoji: reaction.emoji, userId: reaction.userId });
    reactionsByMessage.set(reaction.messageId, existing);
  }
  return result.reverse().map((message) => ({
    ...message,
    replyTo: message.replyToMessageId ? repliesById.get(message.replyToMessageId) ?? null : null,
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
  contentType: "text" | "image" | "video" | "screen_share_invite";
  mediaKey?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  mediaBatchId?: string | null;
  replyToMessageId?: number | null;
}) {
  const db = requireDb(await getDb());
  if (!(await isConversationMember(input.conversationId, input.senderId))) {
    throw new Error("Bạn không có quyền gửi tin trong hội thoại này.");
  }
  if (input.replyToMessageId) {
    const [replyTarget] = await db.select({ id: messages.id }).from(messages).where(and(
      eq(messages.id, input.replyToMessageId),
      eq(messages.conversationId, input.conversationId),
    )).limit(1);
    if (!replyTarget) throw new Error("Tin nhắn được trả lời không thuộc hội thoại này.");
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
