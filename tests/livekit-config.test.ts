import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createValidationToken(apiKey: string, apiSecret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: apiKey,
      sub: "chatpht-livekit-validation",
      nbf: now - 5,
      exp: now + 60,
      video: { roomList: true },
    }),
  );
  const signature = createHmac("sha256", apiSecret)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${base64Url(signature)}`;
}

describe("LiveKit configuration", () => {
  it("authenticates a lightweight room-list request with the server-only credentials", async () => {
    vi.unstubAllGlobals();
    const liveKitUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    expect(liveKitUrl).toMatch(/^wss:\/\//);
    expect(apiKey).toBeTruthy();
    expect(apiSecret).toBeTruthy();

    const apiUrl = liveKitUrl!.replace(/^wss:/, "https:");
    const response = await fetch(`${apiUrl}/twirp/livekit.RoomService/ListRooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createValidationToken(apiKey!, apiSecret!)}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    expect(response.ok, await response.text()).toBe(true);
  }, 15_000);
});
