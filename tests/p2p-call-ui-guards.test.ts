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

  it("blocks duplicate answer mutations before P2P is initialized", () => {
    expect(callScreen).toContain("answerInFlight.current");
    expect(callScreen).toContain('p2pState === "idle"');
  });

  it("shows a WebRTC-derived latency badge and never returns an answered recipient to the incoming screen", () => {
    expect(callScreen).toContain("getP2pNetworkQuality(p2pState, latencyMs)");
    expect(callScreen).toContain("onStats: (stats: P2pNetworkStats) => setLatencyMs(stats.latencyMs)");
    expect(callScreen).toContain("<NetworkQualityBadge quality={networkQuality} inverse={fullVideo} />");
    expect(callScreen).toContain('direction === "incoming" && !isAnswered');
    expect(callScreen).toContain('if (state === "recovering") setConnectionError(null);');
  });

  it("gives screen sharing its own visual stage and confines its optional camera preview to screen mode", () => {
    expect(callScreen).toContain('const isVisualMode = mode === "video" || mode === "screen";');
    expect(callScreen).toContain('screenCameraStream={mode === "screen"');
    expect(callScreen).toContain('mode === "screen" ? "P2P · Màn hình + thoại"');
    expect(callScreen).toContain('mode === "video" && localStream');
    expect(callScreen).toContain('mode === "screen" && screenCameraStream');
    expect(callScreen).not.toContain("localScreenStream");
    expect(callScreen).not.toContain("remoteScreenStream");
    expect(callScreen).not.toContain("toggleScreenShare");
  });

  it("keeps voice, video, and screen share as explicit separate actions", () => {
    const chatScreen = readFileSync(resolve(process.cwd(), "app/chat/[id].tsx"), "utf8");

    expect(chatScreen).toContain('beginP2pAction("audio")');
    expect(chatScreen).toContain('beginP2pAction("video")');
    expect(chatScreen).toContain('beginP2pAction("screen")');
    expect(chatScreen).not.toContain('beginCall("video", true)');
    expect(chatScreen).toContain('p2pMode: mode');
    expect(callScreen).toContain('const activeForCallId = callId ? activeCall.get(callId) : null;');
    expect(callScreen).toContain('activeForCallId?.p2pMode === routeMode');
    expect(callScreen).toContain('const modeConflict = persistedMode !== null && persistedMode !== routeMode;');
    expect(callScreen).toContain('const mode = routeMode;');
    expect(callScreen).toContain('if (modeConflict)');
    expect(callScreen).not.toContain('details.data?.p2pMode ?? routeMode');
    expect(callScreen).not.toContain('p2pScreenShare');
    expect(callScreen).toContain('if (mode === "video") {');
    expect(callScreen).toContain('const kind = callKindForP2pMode(mode)');
    expect(callScreen).toContain('mode === "screen" && isCaller');
    expect(callScreen).toContain('toggleScreenCamera');
    expect(callScreen).not.toContain("startScreenShare");
  });

  it("preserves the server-selected mode through active and push-driven incoming navigation", () => {
    const incomingWatcher = readFileSync(resolve(process.cwd(), "components/incoming-call-watcher.native.tsx"), "utf8");
    const pushManager = readFileSync(resolve(process.cwd(), "components/push-notification-manager.tsx"), "utf8");

    expect(incomingWatcher).toContain("p2pMode: call?.p2pMode");
    expect(pushManager).toContain('payload.p2pMode === "screen"');
    expect(pushManager).toContain("params: { callId, kind, p2pMode, direction: \"incoming\", group }");
  });
});
