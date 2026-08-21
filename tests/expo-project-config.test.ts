import { describe, expect, it } from "vitest";

const expoProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

describe("Cấu hình dự án Expo cho thông báo đẩy", () => {
  it("có định danh dự án hợp lệ để đăng ký token thông báo", async () => {
    expect(expoProjectId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "ExponentPushToken[configuration-check]", title: "Configuration check" }),
    });
    expect([200, 400]).toContain(response.status);
  }, 15_000);
});
