import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("Bề mặt gọi đã được gỡ hoàn toàn", () => {
  it("không còn route, UI, watcher, transport hoặc ICE helper của kiến trúc P2P cũ", () => {
    for (const relativePath of [
      "app/voice-call.tsx",
      "app/voice-call.web.tsx",
      "components/voice-call-screen.native.tsx",
      "components/voice-incoming-watcher.native.tsx",
      "lib/voice-p2p.native.ts",
      "server/voice-ice.ts",
    ]) {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(false);
    }
  });

  it("không còn API, điều hướng hay nút gọi trong ứng dụng", () => {
    const routers = source("server/routers.ts");
    const db = source("server/db.ts");
    const chat = source("app/chat/[id].tsx");
    const layout = source("app/_layout.tsx");
    expect(routers).not.toMatch(/^\s*voice:\s*router\(/m);
    expect(routers).not.toContain("getVoiceIceServers");
    expect(db).not.toMatch(/createVoiceCallSession|getVoiceCallSession|createVoiceSignal|drainVoiceSignals/);
    expect(chat).not.toMatch(/beginVoiceCall|trpc\.voice|voice-call/);
    expect(layout).not.toMatch(/VoiceIncomingWatcher|name="voice-call"/);
  });

  it("gỡ WebRTC native nhưng giữ nguyên khả năng camera và micro cho gửi media", () => {
    const config = source("app.config.ts");
    const packageManifest = source("package.json");
    expect(config).not.toContain("react-native-webrtc");
    expect(packageManifest).not.toContain("react-native-webrtc");
    expect(config).toContain('"expo-camera"');
    expect(config).toContain('"expo-audio"');
    expect(config).toContain('"expo-image-picker"');
    expect(config).toContain("recordAudioAndroid: true");
    expect(config).not.toContain('"MODIFY_AUDIO_SETTINGS"');
    expect(config).not.toContain('"BLUETOOTH_CONNECT"');
    expect(config).toContain('"POST_NOTIFICATIONS"');
  });

  it("chỉ lưu schema lịch sử và chặn rõ ràng việc khôi phục P2P cũ", () => {
    const schema = source("drizzle/schema.ts");
    expect(schema).toContain("Historical call records retained only to preserve existing MySQL data.");
    expect(schema).toContain("must not re-enable the retired P2P architecture");
  });
});
