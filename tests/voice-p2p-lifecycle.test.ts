import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const readProjectFile = (relativePath: string) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

describe("voice P2P lifecycle guards", () => {
  it("serializes signaling and does not restart ICE before an answer is applied", () => {
    const transport = readProjectFile("lib/voice-p2p.native.ts");
    expect(transport).toContain("private inboundSignalChain: Promise<void> = Promise.resolve();");
    expect(transport).toContain("private initialOfferSent = false;");
    expect(transport).toContain("if (!iceRestart && this.initialOfferSent) return;");
    expect(transport).toContain("!this.remoteDescriptionSet");
    expect(transport).toContain("this.remoteDescriptionSet = true;");
  });

  it("keeps the native peer stable across mutation re-renders and returns locally without waiting for end RPC", () => {
    const screen = readProjectFile("components/voice-call-screen.native.tsx");
    expect(screen).toContain("const sendSignalRef = useRef(sendSignal.mutateAsync);");
    expect(screen).toContain("const cleanupPeer = useCallback");
    expect(screen).toContain("router.back();\n    void request.catch(() => undefined);");
    expect(screen).not.toContain("await end.mutateAsync({ callId })");
  });
});
