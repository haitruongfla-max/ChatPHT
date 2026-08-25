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

  it("gives screen sharing a focused stage in voice or video calls without mirroring the local display stream", () => {
    expect(callScreen).toContain('kind === "video" || Boolean(localScreenStream) || Boolean(remoteScreenStream)');
    expect(callScreen).toContain('const main = remoteScreenStream ?? (localScreenSharing ? null : remoteStream);');
    expect(callScreen).toContain("Bản xem trước được ẩn để tránh hiệu ứng lặp.");
    expect(callScreen).toContain('const corner = localStream;');
  });

  it("keeps voice, video, and screen share as explicit separate actions", () => {
    const chatScreen = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");

    expect(chatScreen).toContain('beginP2pAction("audio")');
    expect(chatScreen).toContain('beginP2pAction("video")');
    expect(chatScreen).toContain('beginP2pAction("screen")');
    expect(chatScreen).not.toContain('beginCall("video", true)');
    expect(chatScreen).toContain('p2pMode: mode');
    expect(callScreen).toContain('const mode = toP2pCallMode');
    expect(callScreen).toContain('details.data?.p2pMode ?? routeMode');
    expect(callScreen).not.toContain('p2pScreenShare');
    expect(callScreen).toContain('const startsWithScreenShare = mode === "screen"');
    expect(callScreen).toContain('const kind = callKindForP2pMode(mode)');
  });

  it("preserves the server-selected mode through active and push-driven incoming navigation", () => {
    const incomingWatcher = readFileSync(resolve(process.cwd(), "components/incoming-call-watcher.native.tsx"), "utf8");
    const pushManager = readFileSync(resolve(process.cwd(), "components/push-notification-manager.tsx"), "utf8");

    expect(incomingWatcher).toContain("p2pMode: call?.p2pMode");
    expect(pushManager).toContain('payload.p2pMode === "screen"');
    expect(pushManager).toContain("params: { callId, kind, p2pMode, direction: \"incoming\", group }");
  });
});
