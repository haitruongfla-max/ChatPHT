import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("Voice P2P được tái xây từ nền không-call", () => {
  it("chỉ có route và transport voice mới; toàn bộ coordinator ba mode cũ vẫn vắng mặt", () => {
    expect(existsSync(resolve(root, "app/voice-call.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "lib/voice-p2p.native.ts"))).toBe(true);
    for (const relativePath of [
      "app/call.native.tsx",
      "app/call/audio.native.tsx",
      "app/call/video.native.tsx",
      "app/call/screen.native.tsx",
      "lib/p2p-call.native.ts",
      "lib/p2p-voice-session.native.ts",
      "lib/p2p-video-call.ts",
      "lib/p2p-screen-call.ts",
      "lib/p2p-screen-share.ts",
      "server/p2p-turn.ts",
    ]) expect(existsSync(resolve(root, relativePath)), relativePath).toBe(false);
  });

  it("không cho voice mở camera hoặc Android MediaProjection", () => {
    const peer = source("lib/voice-p2p.native.ts");
    const config = source("app.config.ts");
    expect(peer).toContain("video: false");
    expect(peer).toContain("startPromise");
    expect(peer).not.toMatch(/getDisplayMedia|switchCamera|video:\s*true|MediaProjection/i);
    expect(config).toContain("react-native-webrtc");
    expect(config).not.toMatch(/mediaProjection|FOREGROUND_SERVICE/i);
  });

  it("giới hạn server ở direct audio P2P cùng offer/answer/ICE đã xác thực", () => {
    const routers = source("server/routers.ts");
    const db = source("server/db.ts");
    expect(routers).toMatch(/^\s*voice:\s*router\(/m);
    expect(routers).toContain("iceConfig: protectedProcedure");
    expect(routers).toContain("getVoiceIceServers");
    expect(routers).toContain('z.enum(["offer", "answer", "ice"])');
    expect(routers).not.toMatch(/^\s*calls:\s*router\(/m);
    expect(db).toContain('conversation.kind !== "direct"');
    expect(db).toContain('p2pMode: "audio"');
    expect(db).not.toContain('p2pMode: "video"');
    expect(db).not.toContain('p2pMode: "screen"');
  });

  it("chỉ hiển thị entrypoint voice trong header hội thoại trực tiếp", () => {
    const chat = source("app/chat/[id].tsx");
    const layout = source("app/_layout.tsx");
    expect(chat).toContain("beginVoiceCall");
    expect(chat).toContain("!isGroup");
    expect(layout).toContain('name="voice-call"');
    expect(chat).not.toMatch(/beginP2pAction|Gọi video|Chia sẻ màn hình/);
    const voiceScreen = source("components/voice-call-screen.native.tsx");
    expect(voiceScreen).toContain("pendingSignals");
    expect(voiceScreen).not.toContain("if (!peer || !drain.data)");
  });
});
