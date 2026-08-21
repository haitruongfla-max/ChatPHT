import { beforeEach, describe, expect, it, vi } from "vitest";

const { platform, createUploadTask, taskUploadAsync } = vi.hoisted(() => ({
  platform: { OS: "web" },
  createUploadTask: vi.fn(),
  taskUploadAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("expo-file-system/legacy", () => ({
  createUploadTask,
  FileSystemUploadType: { BINARY_CONTENT: "binary" },
}));

import { uploadMediaDirectly } from "../lib/direct-media-upload";

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

    await expect(uploadMediaDirectly({ uri: "file://video.mp4", uploadUrl: "https://upload.example/video", mimeType: "video/mp4" })).rejects.toThrow("Không thể tải video");
  });
});
