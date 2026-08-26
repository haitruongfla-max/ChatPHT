import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app.config.ts");
const configSource = readFileSync(configPath, "utf8");

describe("Cấu hình APK nền OTA", () => {
  it("dùng runtime fingerprint và EAS Update URL của dự án ChatPHT", () => {
    expect(configSource).toContain('policy: "fingerprint"');
    expect(configSource).toContain("https://u.expo.dev/${expoProjectId}");
    expect(configSource).toContain('checkAutomatically: "ON_LOAD"');
    expect(configSource).toContain("fallbackToCacheTimeout: 30_000");
  });

  it("đặt APK cập nhật GitHub mới với versionCode tăng và quyền mở trình cài Android", () => {
    expect(configSource).toContain('version: "1.0.33"');
    expect(configSource).toContain("versionCode: 37");
    expect(configSource).toContain("REQUEST_INSTALL_PACKAGES");
    expect(configSource).not.toContain("FOREGROUND_SERVICE_MEDIA_PROJECTION");
  });
});
