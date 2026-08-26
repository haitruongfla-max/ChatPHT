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
      "src/features/webrtc-calling/services/callToneManager.ts",
      "src/features/webrtc-calling/components/VoiceCall.tsx",
      "src/features/webrtc-calling/components/VideoCall.tsx",
      "src/features/webrtc-calling/components/ScreenShare.tsx",
      "src/features/webrtc-calling/components/CallControls.tsx",
      "src/features/webrtc-calling/components/CallConnectionMeta.tsx",
      "src/features/webrtc-calling/config/iceServers.js",
      "components/calling-manager.tsx",
    ]) {
      expect(existsSync(resolve(root, relativePath)), relativePath).toBe(true);
    }
  });

  it("dùng một core cho media, ICE queue, lifecycle server, âm báo và chỉ số kết nối thật", () => {
    const core = source("src/features/webrtc-calling/hooks/useWebRTC.ts");
    expect(core).toContain("export function useWebRTC");
    expect(core).toContain("getUserMedia");
    expect(core).toContain("getDisplayMedia");
    expect(core).toContain("pendingCandidatesRef");
    expect(core).toContain("replaceTrack");
    expect(core).toContain("systemAudioSenderRef");
    expect(core).toContain("iceRestart: true");
    expect(core).toContain("releaseResources");
    expect(core).toContain("startMutation.mutateAsync");
    expect(core).toContain("acceptMutation.mutateAsync");
    expect(core).toContain("callToneManager");
    expect(core).toContain("getStats");
    expect(core).toContain("currentRoundTripTime");
    expect(core).toContain("durationSeconds");
  });

  it("định tuyến lời mời và SDP/ICE theo user room đã xác thực, không phụ thuộc màn chat đang mở", () => {
    const realtime = source("server/_core/realtime.ts");
    const signaling = source("src/features/webrtc-calling/services/callSignaling.ts");
    expect(realtime).toContain("authenticateSocket");
    expect(realtime).toContain('socket.on("webrtc_call_signal"');
    expect(realtime).toContain("getWebRTCCallForParticipant");
    expect(realtime).toContain("userRoom(peerId)");
    expect(realtime).toContain("webrtc_call_invite");
    expect(realtime).toContain("webrtc_call_lifecycle");
    expect(signaling).toContain('awaitAcknowledgement("webrtc_call_signal"');
    expect(signaling).toContain("onInvite");
  });

  it("tự hoà giải phiên active stale và giữ session sống bằng heartbeat xác thực", () => {
    const schema = source("drizzle/schema.ts");
    const db = source("server/db.ts");
    const router = source("server/routers.ts");
    const core = source("src/features/webrtc-calling/hooks/useWebRTC.ts");
    expect(schema).toContain('lastSeenAt: timestamp("lastSeenAt")');
    expect(db).toContain("WEBRTC_ACTIVE_STALE_TIMEOUT_MS");
    expect(db).toContain("reconcileStaleWebRTCCalls");
    expect(db).toContain('status: "ended", endedAt: now');
    expect(db).toContain("touchWebRTCCall");
    expect(router).toContain("heartbeat: protectedProcedure");
    expect(core).toContain("heartbeatMutation.mutateAsync");
    expect(core).toContain("15_000");
  });

  it("không để peer lỗi hoặc caller gọi lại khóa vĩnh viễn cuộc gọi kế tiếp", () => {
    const db = source("server/db.ts");
    const core = source("src/features/webrtc-calling/hooks/useWebRTC.ts");
    expect(db).toContain('activeSessions[0].callerId === input.callerId && (activeSessions[0].status === "accepted" || activeSessions[0].status === "active")');
    expect(db).toContain('set({ status: "ended", endedAt: now })');
    expect(db).toContain('set({ leftAt: now })');
    expect(core).toContain("failPeerCall");
    expect(core).toContain("endMutation.mutateAsync({ callId })");
    expect(core).toContain("Phiên đã được giải phóng");
  });

  it("chỉ chấp nhận JSON từ tRPC để không hiển thị lỗi JSON Parse mơ hồ khi proxy trả HTML", () => {
    const client = source("lib/trpc.ts");
    const router = source("server/routers.ts");
    const chat = source("app/chat/[id].tsx");
    expect(client).toContain('Accept: "application/json"');
    expect(client).toContain('contentType.includes("application/json")');
    expect(client).toContain("Máy chủ ChatPHT trả về dữ liệu không hợp lệ");
    expect(router).toContain("clientRequestId");
    expect(chat).toContain("sendTextResiliently");
    expect(chat).toContain("clientRequestId");
  });

  it("chỉ mở điều khiển gọi từ header chat 1:1, nhưng overlay/controller được mount toàn cục", () => {
    const chat = source("app/chat/[id].tsx");
    const callingManager = source("components/calling-manager.tsx");
    const config = source("app.config.ts");
    const packageManifest = source("package.json");
    expect(chat).toContain("!isGroup ? (");
    expect(chat).toContain('mode: "voice"');
    expect(chat).toContain('mode: "video"');
    expect(chat).toContain('mode: "screen"');
    expect(chat).toContain("callHistory");
    expect(callingManager).toContain("CallingOverlay");
    expect(callingManager).toContain("useWebRTC");
    expect(config).toContain("withAndroidMediaProjection.js");
    expect(packageManifest).toContain('"react-native-webrtc"');
    expect(config).toContain('"expo-camera"');
    expect(config).toContain('"expo-audio"');
  });
});
