import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const PUSH_TOKEN_STORAGE_KEY = "swiftchat.push-token";
const FCM_TOKEN_STORAGE_KEY = "swiftchat.fcm-token";
const PUSH_ENABLED_STORAGE_KEY = "swiftchat.push-enabled";

export type PushTransport = "expo" | "fcm";
export type IncomingCallAction = "answer" | "decline";

export type RegisteredPushTokens = {
  expoToken: string;
  fcmToken: string | null;
};

export function conversationIdFromPushData(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const rawValue = (data as Record<string, unknown>).conversationId;
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Chỉ tin từ activity Android có scheme ChatPHT và callId đúng định dạng mới được xử lý. */
export function incomingCallActionFromUrl(url: string): { callId: string; action: IncomingCallAction } | null {
  const parsed = Linking.parse(url);
  if (parsed.hostname !== "incoming-call") return null;
  const callId = parsed.queryParams?.callId;
  const action = parsed.queryParams?.callAction;
  if (typeof callId !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(callId)) return null;
  if (action !== "answer" && action !== "decline") return null;
  return { callId, action };
}

export async function ensureChatNotificationChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Tin nhắn mới",
    description: "Thông báo khi bạn nhận được tin nhắn ChatPHT mới.",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 120],
    lightColor: "#2563EB",
  });
  await Notifications.setNotificationChannelAsync("calls", {
    name: "Cuộc gọi đến",
    description: "Hiển thị cuộc gọi ChatPHT đến với nút Nghe hoặc Từ chối.",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 250, 400],
    lightColor: "#16A34A",
    sound: "default",
  });
}

export async function registerForChatPushNotifications(): Promise<RegisteredPushTokens | null> {
  if (Platform.OS === "web") return null;
  if (!(await areChatPushNotificationsEnabled())) return null;
  await ensureChatNotificationChannels();

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;

  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = Constants.easConfig?.projectId ?? extra?.eas?.projectId;
  const expoToken = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  let fcmToken: string | null = null;
  if (Platform.OS === "android") {
    try {
      const nativeToken = await Notifications.getDevicePushTokenAsync();
      if (nativeToken.type === "android" && typeof nativeToken.data === "string" && nativeToken.data.length >= 16) fcmToken = nativeToken.data;
    } catch (error) {
      // Expo Push vẫn chạy; lần mở app sau thử lại raw FCM để nhận cuộc gọi native.
      console.warn("[Push] Chưa lấy được FCM token native.", error);
    }
  }
  return { expoToken: expoToken.data, fcmToken };
}

export async function getStoredPushToken() {
  return AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function getStoredPushTokens() {
  const [expoToken, fcmToken] = await Promise.all([
    AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY),
    AsyncStorage.getItem(FCM_TOKEN_STORAGE_KEY),
  ]);
  return { expoToken, fcmToken };
}

export async function storePushToken(token: string, transport: PushTransport = "expo") {
  await AsyncStorage.setItem(transport === "fcm" ? FCM_TOKEN_STORAGE_KEY : PUSH_TOKEN_STORAGE_KEY, token);
}

export async function clearStoredPushToken() {
  await Promise.all([AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY), AsyncStorage.removeItem(FCM_TOKEN_STORAGE_KEY)]);
}

export async function areChatPushNotificationsEnabled() {
  return (await AsyncStorage.getItem(PUSH_ENABLED_STORAGE_KEY)) !== "false";
}

export async function setChatPushNotificationsEnabled(enabled: boolean) {
  await AsyncStorage.setItem(PUSH_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}
