import { describe, expect, it } from "vitest";

import { preserveStableMediaUrl } from "../lib/stable-media-url";

describe("preserveStableMediaUrl", () => {
  it("giữ URI capability đầu tiên của một ảnh khi polling trả URL ký mới", () => {
    const cache = new Map<string, string>();
    const initial = { mediaCacheKey: "chat-media-42", mediaUrl: "https://api.example/media/42?access_token=first" };
    const refreshed = { mediaCacheKey: "chat-media-42", mediaUrl: "https://api.example/media/42?access_token=renewed" };

    expect(preserveStableMediaUrl(cache, initial).mediaUrl).toBe(initial.mediaUrl);
    expect(preserveStableMediaUrl(cache, refreshed).mediaUrl).toBe(initial.mediaUrl);
  });

  it("không cache dữ liệu không có URL hoặc khóa media", () => {
    const cache = new Map<string, string>();
    const text = { mediaCacheKey: null, mediaUrl: null };

    expect(preserveStableMediaUrl(cache, text)).toBe(text);
    expect(cache.size).toBe(0);
  });
});
