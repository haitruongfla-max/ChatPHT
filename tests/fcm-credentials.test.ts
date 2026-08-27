import { describe, expect, it } from "vitest";
import { getFcmAccessToken } from "../server/fcm-credentials";

describe("FCM service account", () => {
  it("lấy được OAuth access token từ Firebase service account đã cấu hình", async () => {
    const result = await getFcmAccessToken();

    expect(result.accessToken.length).toBeGreaterThan(20);
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(result.projectId.length).toBeGreaterThan(0);
  }, 30_000);
});
