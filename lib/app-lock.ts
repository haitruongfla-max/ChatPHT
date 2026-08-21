import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PIN_KEY = "swiftchat.app-lock-pin.v1";
type AppLockChange = "configured" | "cleared";
const listeners = new Set<(change: AppLockChange) => void>();

function validPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

function webStorage() {
  if (typeof globalThis === "undefined" || Platform.OS !== "web") return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

async function readPin() {
  const storage = webStorage();
  return storage ? storage.getItem(PIN_KEY) : SecureStore.getItemAsync(PIN_KEY);
}

async function writePin(pin: string) {
  const storage = webStorage();
  if (storage) {
    storage.setItem(PIN_KEY, pin);
    return;
  }
  await SecureStore.setItemAsync(PIN_KEY, pin, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function removePin() {
  const storage = webStorage();
  if (storage) {
    storage.removeItem(PIN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(PIN_KEY);
}

export async function hasAppLockPin() {
  return Boolean(await readPin());
}

export async function saveAppLockPin(pin: string) {
  if (!validPin(pin)) throw new Error("Mã khóa cần gồm 4 đến 8 chữ số.");
  await writePin(pin);
  notifyAppLockChanged("configured");
}

export async function verifyAppLockPin(pin: string) {
  const stored = await readPin();
  return Boolean(stored && pin === stored);
}

export async function clearAppLockPin() {
  await removePin();
  notifyAppLockChanged("cleared");
}

export function subscribeToAppLockChanges(listener: (change: AppLockChange) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyAppLockChanged(change: AppLockChange) {
  listeners.forEach((listener) => listener(change));
}
