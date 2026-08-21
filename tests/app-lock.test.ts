import { beforeEach, describe, expect, it, vi } from "vitest";

const { secureStore } = vi.hoisted(() => ({
  secureStore: {
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  },
}));

vi.mock("expo-secure-store", () => secureStore);
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import { clearAppLockPin, hasAppLockPin, saveAppLockPin, subscribeToAppLockChanges, verifyAppLockPin } from "../lib/app-lock";

describe("app lock PIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only stores PINs with 4 to 8 digits in the device secure store", async () => {
    await expect(saveAppLockPin("12a4")).rejects.toThrow("4 đến 8 chữ số");
    await expect(saveAppLockPin("123")).rejects.toThrow("4 đến 8 chữ số");
    await saveAppLockPin("4826");
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "swiftchat.app-lock-pin.v1",
      "4826",
      { keychainAccessible: "device-only" },
    );
  });

  it("checks, reports, and clears the configured PIN without server access", async () => {
    secureStore.getItemAsync.mockResolvedValue("4826");
    const changes: string[] = [];
    const unsubscribe = subscribeToAppLockChanges((change) => changes.push(change));
    await expect(hasAppLockPin()).resolves.toBe(true);
    await expect(verifyAppLockPin("4826")).resolves.toBe(true);
    await expect(verifyAppLockPin("1111")).resolves.toBe(false);
    await clearAppLockPin();
    unsubscribe();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("swiftchat.app-lock-pin.v1");
    expect(changes).toContain("cleared");
  });
});
