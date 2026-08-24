import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), "lib", file), "utf8");

const audioModule = source("p2p-audio-call.ts");
const videoModule = source("p2p-video-call.ts");
const screenModule = source("p2p-screen-share.ts");
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

  it("keeps screen sharing responsible for MediaProjection only", () => {
    expect(screenModule).toContain("getDisplayMedia");
    expect(screenModule).not.toContain("getUserMedia");
    expect(screenModule).toContain("audio: false");
  });

  it("uses explicit mode to select one base media module and starts screen sharing only on demand", () => {
    expect(coordinator).toContain('options.mode === "video"');
    expect(coordinator).toContain("this.videoCall.start()");
    expect(coordinator).toContain("this.audioCall.start()");
    expect(coordinator).toContain("async startScreenShare()");
    expect(coordinator).toContain("this.screenShare.start({");
  });
});
