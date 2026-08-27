import * as db from "./db";
import { getFcmAccessToken } from "./fcm-credentials";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const FCM_ENDPOINT = (projectId: string) => `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
const MESSAGE_PREVIEW_LIMIT = 180;
const TITLE_LIMIT = 64;

type PushPayload = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "normal";
  ttl: number;
  channelId: "messages";
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

export function normalizePushPreview(value: string, limit = MESSAGE_PREVIEW_LIMIT) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "Bạn có tin nhắn mới";
  return normalized.length > limit ? `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…` : normalized;
}

function normalizePushTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim() || "Người dùng ChatPHT";
  return normalized.length > TITLE_LIMIT ? `${normalized.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : normalized;
}

export function buildNewMessagePushPayload(input: {
  token: string;
  conversationId: number;
  senderDisplayName: string;
  preview: string;
}): PushPayload {
  return {
    to: input.token,
    title: normalizePushTitle(input.senderDisplayName),
    body: normalizePushPreview(input.preview),
    sound: "default",
    priority: "normal",
    ttl: 86_400,
    channelId: "messages",
    data: { conversationId: input.conversationId },
  };
}

function isExpoPushToken(token: string) {
  return /^(?:Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}

/** Push errors must never delay or prevent a chat message from being sent. */
export async function dispatchNewMessagePushNotifications(input: { conversationId: number; senderId: number; preview: string }) {
  try {
    const [devices, sender] = await Promise.all([
      db.listConversationRecipientDevices(input.conversationId, input.senderId),
      db.getUserById(input.senderId),
    ]);
    const senderDisplayName = sender ? db.toPublicProfile(sender).displayName : "Người dùng ChatPHT";
    const tokens = [...new Set(devices.filter((device) => device.transport === "expo").map((device) => device.token).filter(isExpoPushToken))];
    if (!tokens.length) return { sent: 0 };

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((token) => buildNewMessagePushPayload({ token, conversationId: input.conversationId, senderDisplayName, preview: input.preview }))),
    });
    return { sent: await getAcceptedPushCount(response, tokens.length, "message notification(s)") };
  } catch (error) {
    console.warn("[Push] Could not dispatch a new-message notification.", error);
    return { sent: 0 };
  }
}

export type IncomingCallPushInput = {
  callId: string;
  conversationId: number;
  callerId: number;
  callerDisplayName: string;
  mode: "voice" | "video" | "screen";
  expiresAt: Date;
};

type FcmMessage = {
  token: string;
  data: Record<string, string>;
  android: { priority: "HIGH"; ttl: string; direct_boot_ok: true };
};

/**
 * Payload FCM chỉ có metadata đủ để native hiển thị lời mời. SDP, ICE, TURN,
 * bearer/session token và dữ liệu media luôn bị loại khỏi payload này.
 */
export function buildIncomingCallFcmMessage(token: string, input: IncomingCallPushInput, now = Date.now()): FcmMessage | null {
  const remainingMs = input.expiresAt.getTime() - now;
  if (remainingMs <= 0) return null;
  const ttlSeconds = Math.min(30, Math.max(1, Math.ceil(remainingMs / 1_000)));
  return {
    token,
    data: {
      eventType: "incoming_call",
      callId: input.callId,
      conversationId: String(input.conversationId),
      callerId: String(input.callerId),
      callerName: normalizePushTitle(input.callerDisplayName),
      mode: input.mode,
      expiresAt: String(input.expiresAt.getTime()),
    },
    android: { priority: "HIGH", ttl: `${ttlSeconds}s`, direct_boot_ok: true },
  };
}

let cachedFcmAccess: { accessToken: string; projectId: string; expiresAt: number } | null = null;
let pendingFcmAccess: Promise<{ accessToken: string; projectId: string }> | null = null;

async function getCachedFcmAccessToken() {
  const now = Date.now();
  if (cachedFcmAccess && cachedFcmAccess.expiresAt - now > 60_000) {
    return { accessToken: cachedFcmAccess.accessToken, projectId: cachedFcmAccess.projectId };
  }
  if (!pendingFcmAccess) {
    pendingFcmAccess = getFcmAccessToken()
      .then(({ accessToken, expiresIn, projectId }) => {
        cachedFcmAccess = { accessToken, projectId, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1_000 };
        return { accessToken, projectId };
      })
      .finally(() => {
        pendingFcmAccess = null;
      });
  }
  return pendingFcmAccess;
}

function shouldDisableFcmToken(response: Response, payload: unknown) {
  if (response.status === 404) return true;
  const details = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: { details?: Array<{ errorCode?: string }> } }).error?.details
    : undefined;
  return Boolean(details?.some((detail) => detail.errorCode === "UNREGISTERED"));
}

/** FCM high priority chỉ dành cho lời mời gọi đang đổ chuông, không ảnh hưởng Socket.IO hiện có. */
export async function dispatchIncomingCallPush(input: IncomingCallPushInput) {
  try {
    const payload = buildIncomingCallFcmMessage("placeholder", input);
    if (!payload) return { sent: 0 };
    const devices = await db.listConversationRecipientDevices(input.conversationId, input.callerId);
    const tokens = [...new Set(devices.filter((device) => device.platform === "android" && device.transport === "fcm").map((device) => device.token))];
    if (!tokens.length) return { sent: 0 };
    const { accessToken, projectId } = await getCachedFcmAccessToken();
    const results = await Promise.allSettled(tokens.map(async (token) => {
      const message = buildIncomingCallFcmMessage(token, input);
      if (!message) return false;
      const response = await fetch(FCM_ENDPOINT(projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message }),
      });
      if (response.ok) return true;
      const errorPayload = await response.json().catch(() => null);
      if (shouldDisableFcmToken(response, errorPayload)) await db.disablePushDevice(token);
      console.warn(`[Push] FCM rejected incoming call with HTTP ${response.status}.`);
      return false;
    }));
    return { sent: results.filter((result) => result.status === "fulfilled" && result.value).length };
  } catch (error) {
    console.warn("[Push] Could not dispatch an incoming-call FCM notification.", error);
    return { sent: 0 };
  }
}
