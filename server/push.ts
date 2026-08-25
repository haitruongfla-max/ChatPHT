import * as db from "./db";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type PushPayload = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  ttl: number;
  channelId: "messages" | "calls";
  data: Record<string, number | string>;
};

type ExpoPushTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

async function getAcceptedPushCount(response: Response, expectedCount: number, label: string) {
  if (!response.ok) {
    console.warn(`[Push] Expo service rejected ${label} with HTTP ${response.status}.`);
    return 0;
  }
  const payload = (await response.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null;
  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  if (!tickets.length) {
    console.warn(`[Push] Expo service returned no tickets for ${label}.`);
    return 0;
  }
  const rejected = tickets.filter((ticket) => ticket.status !== "ok");
  if (rejected.length) {
    const detail = rejected.map((ticket) => ticket.details?.error ?? ticket.message ?? "unknown error").join("; ");
    console.warn(`[Push] Expo rejected ${rejected.length}/${expectedCount} ${label}: ${detail}`);
  }
  return tickets.filter((ticket) => ticket.status === "ok").length;
}

export function buildNewMessagePushPayload(token: string, conversationId: number): PushPayload {
  return {
    to: token,
    title: "ChatPHT",
    body: "Bạn có tin nhắn mới",
    sound: "default",
    priority: "high",
    ttl: 86_400,
    channelId: "messages",
    data: { conversationId },
  };
}

export function buildIncomingCallPushPayload(token: string, input: { conversationId: number; callId: string; kind: "audio" | "video"; p2pMode: "audio" | "video" | "screen"; isGroup?: boolean }): PushPayload {
  return {
    to: token,
    title: input.isGroup ? (input.kind === "video" ? "Cuộc gọi video nhóm" : "Cuộc gọi thoại nhóm") : (input.kind === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến"),
    body: input.isGroup ? "Mở ChatPHT để tham gia phòng gọi nhóm" : "Mở ChatPHT để nhận hoặc từ chối cuộc gọi",
    sound: "default",
    priority: "high",
    ttl: 60,
    channelId: "calls",
    data: { type: "incoming_call", conversationId: input.conversationId, callId: input.callId, kind: input.kind, p2pMode: input.p2pMode, group: input.isGroup ? "1" : "0" },
  };
}

function isExpoPushToken(token: string) {
  return /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}

/** Push errors must never delay or prevent a chat message from being sent. */
export async function dispatchNewMessagePushNotifications(input: { conversationId: number; senderId: number }) {
  try {
    const devices = await db.listConversationRecipientDevices(input.conversationId, input.senderId);
    const tokens = [...new Set(devices.map((device) => device.token).filter(isExpoPushToken))];
    if (!tokens.length) return { sent: 0 };

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((token) => buildNewMessagePushPayload(token, input.conversationId))),
    });
    return { sent: await getAcceptedPushCount(response, tokens.length, "message notification(s)") };
  } catch (error) {
    console.warn("[Push] Could not dispatch a new-message notification.", error);
    return { sent: 0 };
  }
}

/** Push errors must never prevent the caller from creating a call session. */
export async function dispatchIncomingCallPushNotification(input: { conversationId: number; senderId: number; callId: string; kind: "audio" | "video"; p2pMode: "audio" | "video" | "screen"; isGroup?: boolean }) {
  try {
    const devices = await db.listConversationRecipientDevices(input.conversationId, input.senderId);
    const tokens = [...new Set(devices.map((device) => device.token).filter(isExpoPushToken))];
    if (!tokens.length) return { sent: 0 };
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((token) => buildIncomingCallPushPayload(token, input))),
    });
    return { sent: await getAcceptedPushCount(response, tokens.length, "incoming-call notification(s)") };
  } catch (error) {
    console.warn("[Push] Could not dispatch an incoming-call notification.", error);
    return { sent: 0 };
  }
}
