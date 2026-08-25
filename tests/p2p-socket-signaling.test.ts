import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

function source(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("P2P Socket.IO fast-path", () => {
  it("keeps the protected MySQL drain as the signal-data path", () => {
    const client = source("lib/p2p-signaling-realtime.native.ts");
    const callScreen = source("app/call.native.tsx");

    expect(client).toContain('socket.on("p2p_signal_available"');
    expect(client).toContain("seenSignalIds.has(event.signalId)");
    expect(client).not.toContain("payload:");
    expect(callScreen).toContain("subscribeToP2pSignalAvailability");
    expect(callScreen).toContain("incomingSignals.refetch()");
  });

  it("emits a recipient-scoped availability event without signal content", () => {
    const realtime = source("server/_core/realtime.ts");
    const router = source("server/routers.ts");

    expect(realtime).toContain('emit("p2p_signal_available", safeEvent)');
    expect(realtime).toContain("const { recipientId, ...safeEvent } = event");
    expect(router).toContain("emitP2pSignalAvailable({");
    expect(router).not.toContain("payload: input.payload,\n            createdAt");
  });
});
