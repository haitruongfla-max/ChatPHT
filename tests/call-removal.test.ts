import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("Gỡ ba tính năng gọi", () => {
  it("không còn route, coordinator hay native transport cho call", () => {
    for (const relativePath of [
      "app/call.native.tsx",
      "app/call/audio.native.tsx",
      "app/call/video.native.tsx",
      "app/call/screen.native.tsx",
      "components/incoming-call-watcher.native.tsx",
      "components/background-call-permission.tsx",
      "lib/p2p-call.native.ts",
      "lib/p2p-voice-session.native.ts",
      "lib/p2p-video-call.ts",
      "lib/p2p-screen-call.ts",
      "server/p2p-turn.ts",
    ]) {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(false);
    }
  });

  it("không còn nút hoặc điều hướng call ở ứng dụng và thông báo", () => {
    const chat = source("app/chat/[id].tsx");
    const layout = source("app/_layout.tsx");
    const pushManager = source("components/push-notification-manager.tsx");
    const push = source("lib/push-notifications.ts");

    expect(chat).not.toMatch(/beginP2p|Gọi thoại|Gọi video|Chia sẻ màn hình/);
    expect(layout).not.toMatch(/IncomingCallWatcher|CallOverlay|call\/incoming/);
    expect(pushManager).not.toMatch(/callId|incoming-call|\/call\//);
    expect(push).not.toMatch(/"calls"|Cuộc gọi đến/);
  });

  it("không còn router hoặc dependency runtime của P2P/WebRTC", () => {
    const routers = source("server/routers.ts");
    const appConfig = source("app.config.ts");
    const packageJson = JSON.parse(source("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(routers).not.toMatch(/^\s*calls:\s*router\(/m);
    expect(routers).not.toMatch(/p2pSignal|p2pTelemetry|p2pIceConfig/);
    expect(appConfig).not.toMatch(/react-native-webrtc|with-chatpht-android-p2p|mediaProjection/i);
    expect(appConfig).not.toMatch(/FOREGROUND_SERVICE|REQUEST_IGNORE_BATTERY_OPTIMIZATIONS|gọi (thoại|video)/i);
    expect(dependencies["react-native-webrtc"]).toBeUndefined();
    expect(dependencies["expo-pip-android"]).toBeUndefined();
  });
});
