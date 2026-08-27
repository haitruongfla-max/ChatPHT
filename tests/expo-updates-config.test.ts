import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app.config.ts");
const configSource = readFileSync(configPath, "utf8");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const updaterSource = readFileSync(resolve(projectRoot, "lib", "github-release-update.native.ts"), "utf8");
const profileSource = readFileSync(resolve(projectRoot, "app", "(tabs)", "profile.tsx"), "utf8");

describe("Cấu hình APK nền OTA", () => {
  it("dùng runtime fingerprint và EAS Update URL của dự án ChatPHT", () => {
    expect(configSource).toContain('policy: "fingerprint"');
    expect(configSource).toContain("https://u.expo.dev/${expoProjectId}");
    expect(configSource).toContain('checkAutomatically: "ON_LOAD"');
    expect(configSource).toContain("fallbackToCacheTimeout: 30_000");
  });

  it("đặt APK cập nhật GitHub mới với versionCode tăng, trình cài và quyền WebRTC", () => {
    expect(configSource).toContain('version: "1.0.46"');
    expect(configSource).toContain("versionCode: 50");
    expect(configSource).toContain("REQUEST_INSTALL_PACKAGES");
    expect(configSource).toContain("withAndroidMediaProjection.js");
    expect(configSource).toContain("RECORD_AUDIO");
  });

  it("mở đúng trang cấp quyền nguồn cài đặt của ChatPHT khi Android chặn APK", () => {
    expect(updaterSource).toContain("MANAGE_UNKNOWN_APP_SOURCES");
    expect(updaterSource).toContain("package:${packageName}");
    expect(profileSource).toContain("Mở quyền cài APK");
    expect(profileSource).toContain("openUnknownAppSourcesSettings");
  });
});
