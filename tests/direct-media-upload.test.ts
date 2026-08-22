import { beforeEach, describe, expect, it, vi } from "vitest";

const { platform, createUploadTask, taskUploadAsync, copyAsync, getAssetInfoAsync } = vi.hoisted(() => ({
  platform: { OS: "web" },
  createUploadTask: vi.fn(),
  taskUploadAsync: vi.fn(),
  copyAsync: vi.fn(),
  getAssetInfoAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("expo-file-system/legacy", () => ({
  createUploadTask,
  copyAsync,
  cacheDirectory: "file://cache/",
  FileSystemUploadType: { BINARY_CONTENT: "binary" },
}));
vi.mock("expo-media-library", () => ({ getAssetInfoAsync }));

import { resolveMediaUploadUri, uploadMediaDirectly } from "../lib/direct-media-upload";

describe("direct private media upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.OS = "web";
  });

  it("uploads a web file as binary and completes the progress callback", async () => {
    const blob = new Blob(["video"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ blob: vi.fn().mockResolvedValue(blob) }).mockResolvedValueOnce({ ok: true }));
    const onProgress = vi.fn();
    await uploadMediaDirectly({ uri: "blob:video", uploadUrl: "https://upload.example/video", mimeType: "video/mp4", onProgress });
    expect(fetch).toHaveBeenLastCalledWith("https://upload.example/video", expect.objectContaining({ method: "PUT", body: blob }));
    expect(onProgress).toHaveBeenNthCalledWith(1, 0);
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it("uses a native binary upload task and reports percentage progress", async () => {
    platform.OS = "android";
    const onProgress = vi.fn();
    taskUploadAsync.mockResolvedValue({ status: 200 });
    createUploadTask.mockImplementation((_url: string, _uri: string, _options: unknown, callback: (data: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void) => {
      callback({ totalBytesSent: 25, totalBytesExpectedToSend: 100 });
      return { uploadAsync: taskUploadAsync };
    });

    await uploadMediaDirectly({ uri: "file://video.mp4", uploadUrl: "https://upload.example/video", mimeType: "video/mp4", onProgress });

    expect(createUploadTask).toHaveBeenCalledWith("https://upload.example/video", "file://video.mp4", expect.objectContaining({ httpMethod: "PUT" }), expect.any(Function));
    expect(onProgress).toHaveBeenCalledWith(25);
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it("raises a readable error when native storage rejects the upload", async () => {
    platform.OS = "android";
    taskUploadAsync.mockResolvedValue({ status: 413 });
    createUploadTask.mockReturnValue({ uploadAsync: taskUploadAsync });

    await expect(uploadMediaDirectly({ uri: "file://video.mp4", uploadUrl: "https://upload.example/video", mimeType: "video/mp4" })).rejects.toThrow("Không thể tải tệp");
  });

  it("copies an Android content URI into app cache before upload", async () => {
    platform.OS = "android";
    copyAsync.mockResolvedValue(undefined);

    const resolved = await resolveMediaUploadUri("content://gallery/clip.mp4");

    expect(resolved).toMatch(/^file:\/\/cache\/chatpht-upload-.*\.mp4$/);
    expect(copyAsync).toHaveBeenCalledWith(expect.objectContaining({ from: "content://gallery/clip.mp4", to: resolved }));
  });

  it("keeps the image extension when preparing an Android content URI for a media preview", async () => {
    platform.OS = "android";
    copyAsync.mockResolvedValue(undefined);

    const resolved = await resolveMediaUploadUri("content://gallery/preview-photo.jpeg?session=1");

    expect(resolved).toMatch(/\.jpeg$/);
  });

  it("uses the iOS local library URI when the picker returns a ph URI", async () => {
    platform.OS = "ios";
    getAssetInfoAsync.mockResolvedValue({ localUri: "file://photo.jpg", uri: "ph://photo" });

    await expect(resolveMediaUploadUri("ph://photo", "asset-1")).resolves.toBe("file://photo.jpg");
    expect(getAssetInfoAsync).toHaveBeenCalledWith("asset-1");
  });
});
