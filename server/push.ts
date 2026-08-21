import * as db from "./db";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type PushPayload = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: "messages" | "calls";
  data: Record<string, number | string>;
};

export function buildNewMessagePushPayload(token: string, conversationId: number): PushPayload {
  return {
    to: token,
    title: "ChatPHT",
    body: "Bạn có tin nhắn mới",
    sound: "default",
    priority: "high",
    channelId: "messages",
    data: { conversationId },
  };
}

export function buildIncomingCallPushPayload(token: string, input: { conversationId: number; callId: string; kind: "audio" | "video" }): PushPayload {
  return {
    to: token,
    title: input.kind === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến",
    body: "Mở ChatPHT để nhận hoặc từ chối cuộc gọi",
    sound: "default",
    priority: "high",
    channelId: "calls",
    data: { conversationId: input.conversationId, callId: input.callId, kind: input.kind },
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
    if (!response.ok) {
      console.warn("[Push] Expo service rejected a notification batch.");
      return { sent: 0 };
    }
    return { sent: tokens.length };
  } catch (error) {
    console.warn("[Push] Could not dispatch a new-message notification.", error);
    return { sent: 0 };
  }
}

/** Push errors must never prevent the caller from creating a call session. */
export async function dispatchIncomingCallPushNotification(input: { conversationId: number; senderId: number; callId: string; kind: "audio" | "video" }) {
  try {
    const devices = await db.listConversationRecipientDevices(input.conversationId, input.senderId);
    const tokens = [...new Set(devices.map((device) => device.token).filter(isExpoPushToken))];
    if (!tokens.length) return { sent: 0 };
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((token) => buildIncomingCallPushPayload(token, input))),
    });
    return { sent: response.ok ? tokens.length : 0 };
  } catch (error) {
    console.warn("[Push] Could not dispatch an incoming-call notification.", error);
    return { sent: 0 };
  }
}
