import { beforeEach, describe, expect, it, vi } from "vitest";

const createRoom = vi.fn();
const addGrant = vi.fn();
const toJwt = vi.fn(async () => "signed-token");

vi.mock("livekit-server-sdk", () => ({
  TrackSource: {
    SCREEN_SHARE: "screen_share",
    SCREEN_SHARE_AUDIO: "screen_share_audio",
    MICROPHONE: "microphone",
  },
  RoomServiceClient: class {
    constructor(..._args: unknown[]) {}
    createRoom = createRoom;
  },
  AccessToken: class {
    constructor(..._args: unknown[]) {}
    addGrant = addGrant;
    toJwt = toJwt;
  },
}));

import { createLiveKitScreenShareRoom, createLiveKitScreenShareToken } from "../server/call-token";

describe("LiveKit independent screen-share policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEKIT_URL = "wss://livekit.example";
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret";
  });

  it("creates a dedicated room capped at one host and ten viewers", async () => {
    await createLiveKitScreenShareRoom("chatpht-screen-test");

    expect(createRoom).toHaveBeenCalledWith({
      name: "chatpht-screen-test",
      maxParticipants: 11,
      emptyTimeout: 120,
      departureTimeout: 30,
    });
  });

  it("limits host publication to screen, screen audio, and microphone for two hours", async () => {
    await expect(createLiveKitScreenShareToken({ room: "screen-room", identity: "user-7", displayName: "Host", role: "host" })).resolves.toMatchObject({
      serverUrl: "wss://livekit.example",
      room: "screen-room",
      token: "signed-token",
      role: "host",
    });
    expect(addGrant).toHaveBeenCalledWith({
      roomJoin: true,
      room: "screen-room",
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["screen_share", "screen_share_audio", "microphone"],
    });
  });

  it("limits viewers to optional microphone publishing and subscription", async () => {
    await createLiveKitScreenShareToken({ room: "screen-room", identity: "user-9", displayName: "Viewer", role: "viewer" });

    expect(addGrant).toHaveBeenCalledWith({
      roomJoin: true,
      room: "screen-room",
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["microphone"],
    });
  });
});
