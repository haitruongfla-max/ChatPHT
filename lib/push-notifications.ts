import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const PUSH_TOKEN_STORAGE_KEY = "swiftchat.push-token";
const PUSH_ENABLED_STORAGE_KEY = "swiftchat.push-enabled";

export function conversationIdFromPushData(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const rawValue = (data as Record<string, unknown>).conversationId;
  const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function ensureChatNotificationChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Tin nhắn mới",
    description: "Thông báo khi bạn nhận được tin nhắn ChatPHT mới.",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 100, 180],
    lightColor: "#2563EB",
  });
}

export async function registerForChatPushNotifications() {
  if (Platform.OS === "web") return null;
  if (!(await areChatPushNotificationsEnabled())) return null;

  await ensureChatNotificationChannels();

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;

  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = Constants.easConfig?.projectId ?? extra?.eas?.projectId;
  const token = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export async function getStoredPushToken() {
  return AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function storePushToken(token: string) {
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
}

export async function clearStoredPushToken() {
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

export async function areChatPushNotificationsEnabled() {
  return (await AsyncStorage.getItem(PUSH_ENABLED_STORAGE_KEY)) !== "false";
}

export async function setChatPushNotificationsEnabled(enabled: boolean) {
  await AsyncStorage.setItem(PUSH_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}
