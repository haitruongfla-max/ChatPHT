import * as SecureStore from "expo-secure-store";

const PIN_KEY = "swiftchat.app-lock-pin.v1";
type AppLockChange = "configured" | "cleared";
const listeners = new Set<(change: AppLockChange) => void>();

function validPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export async function hasAppLockPin() {
  return Boolean(await SecureStore.getItemAsync(PIN_KEY));
}

export async function saveAppLockPin(pin: string) {
  if (!validPin(pin)) throw new Error("Mã khóa cần gồm 4 đến 8 chữ số.");
  await SecureStore.setItemAsync(PIN_KEY, pin, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  notifyAppLockChanged("configured");
}

export async function verifyAppLockPin(pin: string) {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return Boolean(stored && pin === stored);
}

export async function clearAppLockPin() {
  await SecureStore.deleteItemAsync(PIN_KEY);
  notifyAppLockChanged("cleared");
}

export function subscribeToAppLockChanges(listener: (change: AppLockChange) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyAppLockChanged(change: AppLockChange) {
  listeners.forEach((listener) => listener(change));
}
