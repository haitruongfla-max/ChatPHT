import { describe, expect, it } from "vitest";

import {
  buildChatMediaCandidate,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
} from "../lib/chat-media-candidates";

describe("ứng viên media chat từ camera hoặc thư viện", () => {
  it("chuẩn hóa ảnh camera vào cùng pipeline upload riêng tư", () => {
    const result = buildChatMediaCandidate({
      uri: "file:///cache/camera-photo.jpg",
      fileSize: 2_048,
      mimeType: "image/jpeg",
      type: "image",
    }, 0, 123);

    expect(result).toEqual({
      ok: true,
      candidate: {
        id: "media-123-0",
        uri: "file:///cache/camera-photo.jpg",
        fileName: "chatpht-123-0.jpg",
        size: 2_048,
        mimeType: "image/jpeg",
      },
    });
  });

  it("giữ video quay camera trong giới hạn 1 GiB", () => {
    const result = buildChatMediaCandidate({
      uri: "file:///cache/camera-video.mp4",
      fileName: "capture.mp4",
      fileSize: CHAT_VIDEO_MAX_BYTES,
      mimeType: "video/mp4",
      type: "video",
    }, 1, 456);

    expect(result).toMatchObject({
      ok: true,
      candidate: { fileName: "capture.mp4", mimeType: "video/mp4" },
    });
  });

  it("từ chối ảnh và video vượt giới hạn trước khi tạo upload", () => {
    expect(buildChatMediaCandidate({
      uri: "file:///cache/large.jpg",
      fileSize: CHAT_IMAGE_MAX_BYTES + 1,
      mimeType: "image/jpeg",
      type: "image",
    }, 0, 1)).toMatchObject({ ok: false, message: "Ảnh tối đa 20 MB." });

    expect(buildChatMediaCandidate({
      uri: "file:///cache/large.mp4",
      fileSize: CHAT_VIDEO_MAX_BYTES + 1,
      mimeType: "video/mp4",
      type: "video",
    }, 0, 1)).toMatchObject({ ok: false, message: "Video tối đa 1GB." });
  });
});
