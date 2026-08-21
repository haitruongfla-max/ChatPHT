import { beforeEach, describe, expect, it, vi } from "vitest";

const { platform, uploadAsync } = vi.hoisted(() => ({
  platform: { OS: "web" },
  uploadAsync: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("expo-file-system/legacy", () => ({
  uploadAsync,
  FileSystemUploadType: { BINARY_CONTENT: "binary" },
}));

import { uploadMediaDirectly } from "../lib/direct-media-upload";

describe("direct private media upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.OS = "web";
  });

  it("uploads a web file as binary rather than converting it to Base64", async () => {
    const blob = new Blob(["video"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ blob: vi.fn().mockResolvedValue(blob) }).mockResolvedValueOnce({ ok: true }));
    await uploadMediaDirectly({ uri: "blob:video", uploadUrl: "https://upload.example/video", mimeType: "video/mp4" });
    expect(fetch).toHaveBeenLastCalledWith("https://upload.example/video", expect.objectContaining({ method: "PUT", body: blob }));
  });

  it("uses binary upload and raises a readable error when native storage rejects it", async () => {
    platform.OS = "android";
    uploadAsync.mockResolvedValue({ status: 413 });
    await expect(uploadMediaDirectly({ uri: "file://video.mp4", uploadUrl: "https://upload.example/video", mimeType: "video/mp4" })).rejects.toThrow("Không thể tải video");
    expect(uploadAsync).toHaveBeenCalledWith("https://upload.example/video", "file://video.mp4", expect.objectContaining({ httpMethod: "PUT" }));
  });
});
