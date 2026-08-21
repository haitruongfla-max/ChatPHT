import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChatPHT branding", () => {
  it("uses the ChatPHT display name and generated logo in Expo configuration", () => {
    const config = readFileSync(resolve(process.cwd(), "app.config.ts"), "utf8");

    expect(config).toContain('appName: "ChatPHT"');
    expect(config).toContain('logoUrl: "/manus-storage/chatpht-icon_c9ee6eac.png"');
  });
});
