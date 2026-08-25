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

  it("tăng versionCode cho APK thử nghiệm handshake P2P 1.0.24 và khai báo MediaProjection Android", () => {
    expect(configSource).toContain('version: "1.0.24"');
    expect(configSource).toContain("versionCode: 28");
    expect(configSource).toContain('"FOREGROUND_SERVICE_MEDIA_PROJECTION"');
  });
});
