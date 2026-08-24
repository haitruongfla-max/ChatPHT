import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core account table. Local accounts use `local:<username>` as their internal openId. */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    username: varchar("username", { length: 24 }).unique(),
    name: varchar("name", { length: 48 }),
    avatarKey: varchar("avatarKey", { length: 512 }),
    email: varchar("email", { length: 320 }),
    passwordHash: varchar("passwordHash", { length: 255 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    accessExpiresAt: timestamp("accessExpiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
);

export const friendRequests = mysqlTable(
  "friend_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    senderId: int("senderId").notNull(),
    recipientId: int("recipientId").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("friend_request_pair_idx").on(table.senderId, table.recipientId),
    index("friend_request_recipient_idx").on(table.recipientId, table.status),
  ],
);

export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    directKey: varchar("directKey", { length: 64 }).unique(),
    kind: mysqlEnum("kind", ["direct", "group"]).default("direct").notNull(),
    title: varchar("title", { length: 80 }),
    avatarKey: varchar("avatarKey", { length: 512 }),
    createdBy: int("createdBy"),
    pinnedMessageId: int("pinnedMessageId"),
    backgroundKey: varchar("backgroundKey", { length: 512 }),
    backgroundSize: int("backgroundSize"),
    backgroundOpacity: int("backgroundOpacity").default(60).notNull(),
    backgroundUpdatedAt: timestamp("backgroundUpdatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
);

export const conversationMembers = mysqlTable(
  "conversation_members",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    userId: int("userId").notNull(),
    hiddenAt: timestamp("hiddenAt"),
    lastDeliveredAt: timestamp("lastDeliveredAt"),
    lastReadAt: timestamp("lastReadAt"),
    typingUntil: timestamp("typingUntil"),
    wallpaperKey: varchar("wallpaperKey", { length: 512 }),
    wallpaperOpacity: int("wallpaperOpacity").default(60).notNull(),
    role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversation_member_unique_idx").on(table.conversationId, table.userId),
    index("conversation_member_user_idx").on(table.userId),
  ],
);

export const pushDevices = mysqlTable(
  "push_devices",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    platform: mysqlEnum("platform", ["ios", "android"]).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("push_device_token_unique_idx").on(table.token),
    index("push_device_user_enabled_idx").on(table.userId, table.enabled),
  ],
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    senderId: int("senderId").notNull(),
    body: text("body"),
    contentType: mysqlEnum("contentType", ["text", "image", "video", "screen_share_invite"]).notNull(),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaMime: varchar("mediaMime", { length: 96 }),
    mediaName: varchar("mediaName", { length: 255 }),
    mediaSize: int("mediaSize"),
    mediaBatchId: varchar("mediaBatchId", { length: 80 }),
    replyToMessageId: int("replyToMessageId"),
    mediaCleanedAt: timestamp("mediaCleanedAt"),
    recalledAt: timestamp("recalledAt"),
    recalledBy: int("recalledBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("message_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("message_conversation_batch_idx").on(table.conversationId, table.mediaBatchId, table.createdAt),
    index("message_reply_idx").on(table.replyToMessageId),
  ],
);

export const storageSettings = mysqlTable("storage_settings", {
  id: int("id").primaryKey(),
  quotaGb: int("quotaGb").default(200).notNull(),
  unlimited: boolean("unlimited").default(false).notNull(),
  scheduledTaskUid: varchar("scheduledTaskUid", { length: 128 }),
  lastCleanupAt: timestamp("lastCleanupAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const callSessions = mysqlTable(
  "call_sessions",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    conversationId: int("conversationId").notNull(),
    callerId: int("callerId").notNull(),
    recipientId: int("recipientId").notNull(),
    room: varchar("room", { length: 96 }).notNull().unique(),
    kind: mysqlEnum("kind", ["audio", "video"]).notNull(),
    // Keep the legacy value in the database enum so existing call history remains readable.
    // Every newly created call is P2P and no service-room token is issued at runtime.
    provider: mysqlEnum("provider", ["livekit", "p2p"]).default("p2p").notNull(),
    isGroup: boolean("isGroup").default(false).notNull(),
    status: mysqlEnum("status", ["ringing", "active", "declined", "ended", "missed"]).default("ringing").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    answeredAt: timestamp("answeredAt"),
    endedAt: timestamp("endedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("call_session_recipient_status_idx").on(table.recipientId, table.status, table.expiresAt),
    index("call_session_conversation_created_idx").on(table.conversationId, table.createdAt),
  ],
);

export const callParticipants = mysqlTable(
  "call_participants",
  {
    id: int("id").autoincrement().primaryKey(),
    callId: varchar("callId", { length: 40 }).notNull(),
    userId: int("userId").notNull(),
    joinedAt: timestamp("joinedAt"),
    leftAt: timestamp("leftAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("call_participant_unique_idx").on(table.callId, table.userId),
    index("call_participant_user_idx").on(table.userId, table.callId),
  ],
);

/**
 * Historical record of the retired multi-viewer screen-share feature.
 * New Android shares are 1:1 P2P tracks in the video call and do not create rows here.
 */
export const screenShareSessions = mysqlTable(
  "screen_share_sessions",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    conversationId: int("conversationId").notNull(),
    hostId: int("hostId").notNull(),
    room: varchar("room", { length: 96 }).notNull().unique(),
    status: mysqlEnum("status", ["starting", "live", "ended", "expired"]).default("starting").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    startedAt: timestamp("startedAt"),
    endedAt: timestamp("endedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("screen_share_conversation_status_idx").on(table.conversationId, table.status, table.createdAt),
    index("screen_share_host_status_idx").on(table.hostId, table.status, table.expiresAt),
  ],
);

export const messageReactions = mysqlTable(
  "message_reactions",
  {
    id: int("id").autoincrement().primaryKey(),
    messageId: int("messageId").notNull(),
    userId: int("userId").notNull(),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("message_reaction_unique_idx").on(table.messageId, table.userId, table.emoji),
    index("message_reaction_message_idx").on(table.messageId),
  ],
);

/** Ephemeral WebRTC signaling for an authorized direct-call pair. Payloads are drained after delivery. */
export const p2pSignals = mysqlTable(
  "p2p_signals",
  {
    id: int("id").autoincrement().primaryKey(),
    callId: varchar("callId", { length: 40 }).notNull(),
    senderId: int("senderId").notNull(),
    recipientId: int("recipientId").notNull(),
    type: mysqlEnum("type", ["offer", "answer", "ice", "screen-start", "screen-stop"]).notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("p2p_signal_recipient_idx").on(table.callId, table.recipientId, table.id),
    index("p2p_signal_call_idx").on(table.callId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CallSession = typeof callSessions.$inferSelect;
export type CallParticipant = typeof callParticipants.$inferSelect;
export type ScreenShareSession = typeof screenShareSessions.$inferSelect;
export type P2pSignal = typeof p2pSignals.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type PushDevice = typeof pushDevices.$inferSelect;
export type StorageSettings = typeof storageSettings.$inferSelect;
