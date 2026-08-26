import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("WebRTC Calling cô lập", () => {
  it("không khôi phục route, watcher hoặc transport P2P đã nghỉ hưu", () => {
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

  it("đặt toàn bộ core, service và UI calling trong module mới", () => {
    for (const relativePath of [
      "src/features/webrtc-calling/hooks/useWebRTC.ts",
      "src/features/webrtc-calling/services/webrtcService.web.ts",
      "src/features/webrtc-calling/services/webrtcService.native.ts",
      "src/features/webrtc-calling/services/callSignaling.ts",
      "src/features/webrtc-calling/components/VoiceCall.tsx",
      "src/features/webrtc-calling/components/VideoCall.tsx",
      "src/features/webrtc-calling/components/ScreenShare.tsx",
      "src/features/webrtc-calling/components/CallControls.tsx",
      "src/features/webrtc-calling/config/iceServers.js",
    ]) {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(true);
    }
  });

  it("dùng một core cho media, ICE queue và replaceTrack chia sẻ màn hình", () => {
    const core = source("src/features/webrtc-calling/hooks/useWebRTC.ts");
    expect(core).toContain("export function useWebRTC");
    expect(core).toContain("getUserMedia");
    expect(core).toContain("getDisplayMedia");
    expect(core).toContain("pendingCandidatesRef");
    expect(core).toContain("replaceTrack");
    expect(core).toContain("systemAudioSenderRef");
    expect(core).toContain("iceRestart: true");
    expect(core).toContain("releaseResources");
  });

  it("relay SDP/ICE chỉ cho thành viên chat 1:1 đã xác thực", () => {
    const realtime = source("server/_core/realtime.ts");
    const signaling = source("src/features/webrtc-calling/services/callSignaling.ts");
    expect(realtime).toContain("authenticateSocket");
    expect(realtime).toContain('socket.on("webrtc_call_signal"');
    expect(realtime).toContain("isDirectConversationMember");
    expect(realtime).toContain("socket.rooms.has(conversationRoom(conversationId))");
    expect(signaling).toContain('awaitAcknowledgement("webrtc_call_signal"');
  });

  it("chỉ mở điều khiển gọi từ header chat 1:1 và khai báo native cần thiết", () => {
    const chat = source("app/chat/[id].tsx");
    const config = source("app.config.ts");
    const packageManifest = source("package.json");
    expect(chat).toContain("!isGroup ? (");
    expect(chat).toContain('calling.startCall("voice")');
    expect(chat).toContain('calling.startCall("video")');
    expect(chat).toContain('calling.startCall("screen")');
    expect(chat).toContain("CallingOverlay");
    expect(config).toContain("withAndroidMediaProjection.js");
    expect(packageManifest).toContain('"react-native-webrtc"');
    expect(config).toContain('"expo-camera"');
    expect(config).toContain('"expo-audio"');
  });
});
