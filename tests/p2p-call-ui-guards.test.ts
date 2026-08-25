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

  it("blocks duplicate answer mutations and starts transport once without depending on a React state race", () => {
    expect(callScreen).toContain("answerInFlight.current");
    expect(callScreen).toContain("p2pStarted.current");
    expect(callScreen).toContain("p2pStartInFlight.current");
    expect(callScreen).not.toContain('p2pState === "idle" && !isConnecting');
    expect(callScreen).toContain("shouldDrainSignals");
    expect(callScreen).toContain("signalDiagnosticStatus(signalDiagnostics)");
    expect(callScreen).toContain("P2P_SIGNAL_SEND_FAILED");
  });

  it("does not block the caller offer on a delayed active poll and applies the answer response immediately", () => {
    expect(callScreen).toContain('const canBootstrapBeforeActive = direction === "outgoing";');
    expect(callScreen).toContain('(isAnswered || canBootstrapBeforeActive)');
    expect(callScreen).toContain('await ensureP2pStarted(false);');
    expect(callScreen).toContain('utils.calls.get.setData({ callId }, accepted.call);');
    expect(callScreen).toContain('await ensureP2pStarted(true);');
    expect(callScreen).toContain("resolveP2pIceServers(");
    expect(callScreen).toContain("iceBootstrap.iceServers");
    expect(callScreen).toContain("onBootstrapPhase: setBootstrapPhase");
    expect(callScreen).toContain("bootstrapPhaseLabel(bootstrapPhase)");
    expect(callScreen).not.toContain('const shouldStart = !isGroup && !modeConflict && isAnswered');
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
    expect(chatScreen).toContain('if (call.p2pMode !== mode || call.kind !== kind)');
    expect(chatScreen).toContain('p2pMode: call.p2pMode');
    expect(chatScreen).toContain('kind: call.kind');
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

  it("shows the immutable mode visibly before connection so video cannot be mistaken for screen sharing", () => {
    expect(callScreen).toContain('GỌI THOẠI · CHỈ MICRO');
    expect(callScreen).toContain('GỌI VIDEO · CAMERA + MICRO');
    expect(callScreen).toContain('CHIA SẺ MÀN HÌNH · MODE RIÊNG');
    expect(callScreen).toContain('<ModeIdentityBadge mode={mode} inverse={fullVideo} />');
  });

  it("preserves the server-selected mode through active and push-driven incoming navigation", () => {
    const incomingWatcher = readFileSync(resolve(process.cwd(), "components/incoming-call-watcher.native.tsx"), "utf8");
    const pushManager = readFileSync(resolve(process.cwd(), "components/push-notification-manager.tsx"), "utf8");

    expect(incomingWatcher).toContain("p2pMode: call?.p2pMode");
    expect(pushManager).toContain('payload.p2pMode === "screen"');
    expect(pushManager).toContain("params: { callId, kind, p2pMode, direction: \"incoming\", group }");
  });
});
