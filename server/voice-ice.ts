import { ENV } from "./_core/env";

export type VoiceIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const GOOGLE_STUN: VoiceIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

/**
 * TURN configuration is read only in the backend process. It is returned only
 * after the requester has been verified as a participant in the voice session.
 */
export function getVoiceIceServers(): VoiceIceServer[] {
  const urls = ENV.voiceTurnUrls.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
  if (!urls.length || !ENV.voiceTurnUsername || !ENV.voiceTurnCredential) return GOOGLE_STUN;
  return [...GOOGLE_STUN, { urls, username: ENV.voiceTurnUsername, credential: ENV.voiceTurnCredential }];
}
