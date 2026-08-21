import { describe, expect, it, vi } from "vitest";

import { saveChatMediaToDevice } from "../lib/save-chat-media";

const image = { uri: "https://signed.example/image.jpg", type: "image" as const, name: "garden photo.jpg" };

describe("saveChatMediaToDevice", () => {
  it("does not request device access on the web", async () => {
    const requestPermission = vi.fn();
    await expect(saveChatMediaToDevice(image, {
      isWeb: true,
      cacheDirectory: null,
      documentDirectory: null,
      requestPermission,
      download: vi.fn(),
      saveToLibrary: vi.fn(),
    })).resolves.toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("stops safely when the device library permission is denied", async () => {
    const download = vi.fn();
    await expect(saveChatMediaToDevice(image, {
      isWeb: false,
      cacheDirectory: "file:///cache/",
      documentDirectory: null,
      requestPermission: vi.fn().mockResolvedValue({ granted: false }),
      download,
      saveToLibrary: vi.fn(),
    })).resolves.toBe("permission-denied");
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads a signed URL to temporary storage and saves the resulting file", async () => {
    const download = vi.fn().mockResolvedValue({ uri: "file:///cache/swiftchat-100.jpg" });
    const saveToLibrary = vi.fn().mockResolvedValue(undefined);
    await expect(saveChatMediaToDevice(image, {
      isWeb: false,
      cacheDirectory: "file:///cache/",
      documentDirectory: null,
      requestPermission: vi.fn().mockResolvedValue({ granted: true }),
      download,
      saveToLibrary,
      now: () => 100,
    })).resolves.toBe("saved");
    expect(download).toHaveBeenCalledWith(image.uri, "file:///cache/swiftchat-100.jpg");
    expect(saveToLibrary).toHaveBeenCalledWith("file:///cache/swiftchat-100.jpg");
  });
});
