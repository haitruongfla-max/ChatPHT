import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serviceEntrypoint = path.resolve(process.cwd(), "src/features/webrtc-calling/services/webrtcService.ts");

describe("webrtc service platform entrypoint", () => {
  it("does not force Android to use the browser implementation", () => {
    const source = fs.readFileSync(serviceEntrypoint, "utf8");
    expect(source).toContain('Platform.OS === "web"');
    expect(source).toContain('require("./webrtcService.native")');
    expect(source).not.toContain('export { webrtcService } from "./webrtcService.web"');
  });
});
