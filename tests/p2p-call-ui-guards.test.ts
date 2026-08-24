import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const callScreen = readFileSync(resolve(process.cwd(), "app/call.native.tsx"), "utf8");

describe("P2P call screen guards", () => {
  it("does not mark the caller connected before WebRTC reports an ICE connection", () => {
    expect(callScreen).toContain('setConnected(state === "connected")');
    expect(callScreen).not.toContain("else setConnected(true);");
    expect(callScreen).toContain('state === "recovering"');
  });

  it("blocks duplicate answer mutations and screen sharing before real P2P connectivity", () => {
    expect(callScreen).toContain("answerInFlight.current");
    expect(callScreen).toContain("!p2p.isConnected()");
  });

  it("shows a local ICE-derived quality badge and never returns an answered recipient to the incoming screen", () => {
    expect(callScreen).toContain("getP2pNetworkQuality(p2pState)");
    expect(callScreen).toContain("<NetworkQualityBadge quality={networkQuality} inverse={fullVideo} />");
    expect(callScreen).toContain('direction === "incoming" && !isAnswered');
    expect(callScreen).toContain('if (state === "recovering") setConnectionError(null);');
  });

  it("gives screen sharing a focused stage only in the isolated screen route without mirroring the local display stream", () => {
    expect(callScreen).toContain('mode === "video" || (mode === "screen" && Boolean(localScreenStream || remoteScreenStream))');
    expect(callScreen).toContain('const main = remoteScreenStream ?? (localScreenSharing ? null : remoteStream);');
    expect(callScreen).toContain("Bản xem trước được ẩn để tránh hiệu ứng lặp.");
    expect(callScreen).toContain('const corner = localStream;');
    expect(callScreen).toContain('mode === "screen" ? <Control label={localScreenStream');
    expect(callScreen).not.toContain('kind === "video" || Boolean(localScreenStream)');
  });

  it("routes voice, video, and screen share through three locked entry files", () => {
    const chatScreen = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");
    const audioRoute = readFileSync(resolve(process.cwd(), "app/call/audio.native.tsx"), "utf8");
    const videoRoute = readFileSync(resolve(process.cwd(), "app/call/video.native.tsx"), "utf8");
    const screenRoute = readFileSync(resolve(process.cwd(), "app/call/screen.native.tsx"), "utf8");

    expect(chatScreen).toContain('beginP2pAction("audio")');
    expect(chatScreen).toContain('beginP2pAction("video")');
    expect(chatScreen).toContain('beginP2pAction("screen")');
    expect(chatScreen).not.toContain('beginCall("video", true)');
    expect(chatScreen).toContain('pathname: p2pCallRoute(mode) as never');
    expect(audioRoute).toContain('lockedMode="audio"');
    expect(videoRoute).toContain('lockedMode="video"');
    expect(screenRoute).toContain('lockedMode="screen"');
    expect(callScreen).toContain('export function P2pCallScreen({ lockedMode }');
    expect(callScreen).toContain('const mode = lockedMode');
    expect(callScreen).toContain('mode === "screen" ? setRemoteScreenStream : () => undefined');
    expect(callScreen).not.toContain('p2pScreenShare');
    expect(callScreen).toContain('const startsWithScreenShare = mode === "screen"');
    expect(callScreen).toContain('const kind = callKindForP2pMode(mode)');
  });

  it("preserves the server-selected mode through active and push-driven incoming navigation", () => {
    const incomingWatcher = readFileSync(resolve(process.cwd(), "components/incoming-call-watcher.native.tsx"), "utf8");
    const pushManager = readFileSync(resolve(process.cwd(), "components/push-notification-manager.tsx"), "utf8");

    expect(incomingWatcher).toContain("p2pCallRoute(call?.p2pMode === \"screen\"");
    expect(incomingWatcher).toContain("p2pMode: call?.p2pMode");
    expect(pushManager).toContain('payload.p2pMode === "screen"');
    expect(pushManager).toContain('pathname: p2pCallRoute(p2pMode) as never');
    expect(pushManager).toContain('params: { callId, kind, direction: "incoming", group }');
  });
});
