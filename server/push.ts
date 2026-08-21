import * as db from "./db";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

type PushPayload = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: "messages";
  data: { conversationId: number };
};

export function buildNewMessagePushPayload(token: string, conversationId: number): PushPayload {
  return {
    to: token,
    title: "SwiftChat",
    body: "Bạn có tin nhắn mới",
    sound: "default",
    priority: "high",
    channelId: "messages",
    data: { conversationId },
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
