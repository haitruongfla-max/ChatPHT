import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), "lib", file), "utf8");

const audioModule = source("p2p-audio-call.ts");
const videoModule = source("p2p-video-call.ts");
const screenModule = source("p2p-screen-share.ts");
const screenCallModule = source("p2p-screen-call.ts");
const coordinator = source("p2p-call.native.ts");

describe("P2P media module isolation", () => {
  it("keeps microphone-only calling separate from camera and MediaProjection", () => {
    expect(audioModule).toContain("getUserMedia");
    expect(audioModule).toContain("video: false");
    expect(audioModule).not.toContain("getDisplayMedia");
    expect(audioModule).not.toContain("_switchCamera");
  });

  it("keeps video calling responsible for camera only, not MediaProjection", () => {
    expect(videoModule).toContain("getUserMedia");
    expect(videoModule).toContain("facingMode");
    expect(videoModule).not.toContain("getDisplayMedia");
  });

  it("keeps the screen capture leaf responsible for MediaProjection only", () => {
    expect(screenModule).toContain("getDisplayMedia");
    expect(screenModule).not.toContain("getUserMedia");
    expect(screenModule).toContain("audio: false");
    expect(screenModule).not.toContain("RTCPeerConnection");
    expect(screenModule).not.toContain("onSignal");
  });

  it("keeps the standalone screen session isolated from call-mode classes while owning its optional screen tracks", () => {
    expect(screenCallModule).toContain("new P2pScreenShare()");
    expect(screenCallModule).not.toContain("P2pAudioCall");
    expect(screenCallModule).not.toContain("P2pVideoCall");
    expect(screenCallModule).toContain("mediaDevices.getUserMedia");
    expect(screenCallModule).toContain("private isCaller");
    expect(screenCallModule).toContain("Chỉ người đang chia sẻ màn hình mới có thể bật camera phụ");
  });

  it("uses explicit immutable mode selection and exposes no dynamic screen-share upgrade API", () => {
    expect(coordinator).toContain('if (mode === "audio")');
    expect(coordinator).toContain('if (mode === "video")');
    expect(coordinator).toContain("this.videoCall.start()");
    expect(coordinator).toContain("this.audioCall.start()");
    expect(coordinator).toContain("this.screenCall.start({ isCaller })");
    expect(coordinator).toContain("setScreenCameraEnabled");
    expect(coordinator).toContain('this.sessionMode !== "screen"');
    expect(coordinator).not.toContain("startScreenShare");
    expect(coordinator).not.toContain("stopScreenShare");
    expect(coordinator).not.toContain("remoteScreenStream");
  });
});
