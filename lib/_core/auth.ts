import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  username: string;
  displayName: string;
  role: "user" | "admin";
  accessExpiresAt: string | Date | null;
};

export async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return null;
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  if (Platform.OS !== "web") await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function removeSessionToken(): Promise<void> {
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

export async function getUserInfo(): Promise<User | null> {
  try {
    const serialized =
      Platform.OS === "web"
        ? typeof window !== "undefined"
          ? window.localStorage.getItem(USER_INFO_KEY)
          : null
        : await SecureStore.getItemAsync(USER_INFO_KEY);
    return serialized ? (JSON.parse(serialized) as User) : null;
  } catch {
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  const serialized = JSON.stringify(user);
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.setItem(USER_INFO_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(USER_INFO_KEY, serialized);
}

export async function clearUserInfo(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.localStorage.removeItem(USER_INFO_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(USER_INFO_KEY);
}
