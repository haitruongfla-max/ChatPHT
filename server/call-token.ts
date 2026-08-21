import { AccessToken } from "livekit-server-sdk";

type CallTokenInput = {
  room: string;
  identity: string;
  displayName: string;
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
