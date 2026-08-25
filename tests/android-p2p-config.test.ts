import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (relative: string) => readFileSync(`${root}/${relative}`, "utf8");

describe("Android P2P call configuration", () => {
  it("enables WebRTC MediaProjection foreground notification and registers the audio-route bridge", () => {
    const plugin = source("plugins/with-chatpht-android-p2p.js");
    const appConfig = source("app.config.ts");
    expect(appConfig).toContain('"./plugins/with-chatpht-android-p2p"');
    expect(appConfig).toContain('"FOREGROUND_SERVICE_MEDIA_PROJECTION"');
    expect(appConfig).toContain('"FOREGROUND_SERVICE_MICROPHONE"');
    expect(appConfig).toContain('"FOREGROUND_SERVICE_CAMERA"');
    expect(plugin).toContain("WebRTCModuleOptions.getInstance().enableMediaProjectionService = true");
    expect(plugin).toContain('"android:foregroundServiceType": "mediaProjection|microphone|camera"');
    expect(plugin).toContain("add(ChatPHTAudioRoutePackage())");
    expect(plugin).toContain("setCommunicationDevice");
    expect(plugin).toContain("import com.facebook.react.ReactPackage");
    expect(plugin).not.toContain("import com.facebook.react.bridge.ReactPackage");
  });

  it("keeps Android camera capture and call audio safeguards enabled", () => {
    const camera = source("components/chat-camera-capture.tsx");
    const voiceSession = source("lib/p2p-voice-session.native.ts");
    expect(camera).toContain("}, 300)");
    expect(camera).toContain("maxDuration: MAX_RECORDING_SECONDS");
    expect(voiceSession).toContain("autoGainControl: true");
    expect(voiceSession).toContain("noiseSuppression: true");
    expect(voiceSession).toContain("setAndroidCallSpeakerRoute");
  });

  it("keeps the P2P voice fast-path release upgradeable from versionCode 33 and the signed asset name stable", () => {
    const appConfig = source("app.config.ts");
    const workflow = source(".github/workflows/build-ota-base-apk.yml");
    expect(appConfig).toContain("versionCode: 34");
    expect(workflow).toContain('default: "v1.0.30-p2p-voice-fastpath-vc34"');
    expect(workflow).toContain("APK_OUTPUT: ./app-release.apk");
    expect(workflow).toContain('"$APK_OUTPUT#app-release.apk"');
    expect(workflow).toContain("P2P Voice Fast Path Test (versionCode 34)");
  });

  it("keeps manufacturer-specific fallback instructions and best-effort intents", () => {
    const settings = source("app/settings.tsx");
    const backgroundSettings = source("lib/background-call-settings.native.ts");
    for (const manufacturer of ["Xiaomi/MIUI", "Oppo/ColorOS", "Realme", "Vivo/FuntouchOS", "Samsung", "Huawei"]) {
      expect(settings).toContain(manufacturer);
    }
    expect(backgroundSettings).toContain("com.realme.securitycenter");
    expect(backgroundSettings).toContain("com.vivo.permissionmanager");
  });
});
