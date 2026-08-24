import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

type CallTokenInput = {
  room: string;
  identity: string;
  displayName: string;
};

type ScreenShareTokenInput = CallTokenInput & {
  role: "host" | "viewer";
};

function liveKitConfig() {
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error("Dịch vụ gọi chưa được cấu hình. Hãy thử lại sau.");
  }
  if (!/^wss:\/\//.test(serverUrl)) throw new Error("Địa chỉ dịch vụ gọi không hợp lệ.");
  return { serverUrl, apiKey, apiSecret };
}

/**
 * Screen sharing is deliberately configured as a small room: one presenter plus
 * at most ten viewers. Explicit creation is required because an auto-created
 * LiveKit room would not inherit this participant cap.
 */
export async function createLiveKitScreenShareRoom(room: string) {
  const { serverUrl, apiKey, apiSecret } = liveKitConfig();
  const httpUrl = serverUrl.replace(/^wss:/, "https:");
  const client = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  await client.createRoom({
    name: room,
    maxParticipants: 11,
    emptyTimeout: 120,
    departureTimeout: 30,
  });
}

export async function createLiveKitCallToken(input: CallTokenInput) {
  const { serverUrl, apiKey, apiSecret } = liveKitConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl: "10m",
  });
  token.addGrant({ roomJoin: true, room: input.room, canPublish: true, canSubscribe: true, canPublishData: true });
  return { serverUrl, room: input.room, token: await token.toJwt() };
}

/**
 * A dedicated room token for independent screen sharing.
 * Viewers can subscribe to the host and only publish a microphone after opting in;
 * they cannot publish a camera or another screen track.
 */
export async function createLiveKitScreenShareToken(input: ScreenShareTokenInput) {
  const { serverUrl, apiKey, apiSecret } = liveKitConfig();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.displayName,
    ttl: "2h",
  });
  const canPublishSources = input.role === "host"
    ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO, TrackSource.MICROPHONE]
    : [TrackSource.MICROPHONE];
  token.addGrant({
    roomJoin: true,
    room: input.room,
    canSubscribe: true,
    canPublishData: false,
    canPublishSources,
  });
  return { serverUrl, room: input.room, token: await token.toJwt(), role: input.role };
}
