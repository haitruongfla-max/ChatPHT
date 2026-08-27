import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pluginPath = path.resolve(import.meta.dirname, "../src/features/webrtc-calling/config/withAndroidIncomingCall.js");
const plugin = fs.readFileSync(pluginPath, "utf8");

describe("Android incoming-call config plugin", () => {
  it("declares data-only Firebase handling, CallStyle/full-screen UI and ConnectionService", () => {
    expect(plugin).toContain("class ChatPhtFirebaseMessagingService : ExpoFirebaseMessagingService");
    expect(plugin).toContain("NotificationCompat.CallStyle.forIncomingCall");
    expect(plugin).toContain("setFullScreenIntent(showIntent, true)");
    expect(plugin).toContain("class ChatPhtConnectionService : ConnectionService");
    expect(plugin).toContain("telecom.addNewIncomingCall(handle, extras)");
    expect(plugin).toContain("android.permission.USE_FULL_SCREEN_INTENT");
    expect(plugin).toContain("android.permission.MANAGE_OWN_CALLS");
  });

  it("keeps secrets and WebRTC signaling out of native FCM payload handling", () => {
    const source = plugin.match(/"ChatPhtFirebaseMessagingService\.kt": `([\s\S]*?)`,/u)?.[1] ?? "";
    expect(source).toContain("IncomingCallNotifier.show(this, data)");
    expect(source).not.toMatch(/\bsdp\b|\bcandidate\b|\bturn\b|\bauthorization\b|\bbearer\b|\bcredential\b/iu);
  });
});
