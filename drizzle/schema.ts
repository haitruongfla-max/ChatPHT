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
    directKey: varchar("directKey", { length: 64 }).notNull().unique(),
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
    contentType: mysqlEnum("contentType", ["text", "image", "video"]).notNull(),
    mediaKey: varchar("mediaKey", { length: 512 }),
    mediaMime: varchar("mediaMime", { length: 96 }),
    mediaName: varchar("mediaName", { length: 255 }),
    mediaSize: int("mediaSize"),
    recalledAt: timestamp("recalledAt"),
    recalledBy: int("recalledBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("message_conversation_created_idx").on(table.conversationId, table.createdAt),
  ],
);

export const callSessions = mysqlTable(
  "call_sessions",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    conversationId: int("conversationId").notNull(),
    callerId: int("callerId").notNull(),
    recipientId: int("recipientId").notNull(),
    room: varchar("room", { length: 96 }).notNull().unique(),
    kind: mysqlEnum("kind", ["audio", "video"]).notNull(),
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CallSession = typeof callSessions.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type PushDevice = typeof pushDevices.$inferSelect;
