import { createHmac } from "node:crypto";

export const P2P_TURN_TTL_SECONDS = 24 * 60 * 60;

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

export type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type P2pTurnEnvironment = {
  turnUrls: string;
  turnSharedSecret: string;
  turnUsername: string;
  turnCredential: string;
};

export type TurnCredential = {
  urls: string[];
  username: string;
  credential: string;
  expiresAt: number;
  authMode: "shared-secret" | "static";
};

function isValidTurnUrl(value: string) {
  if (!value || value.length > 512 || /\s/.test(value) || !/^turns?:/i.test(value)) return false;
  const authority = value.replace(/^turns?:\/?\/?/i, "");
  try {
    const parsed = new URL(`https://${authority}`);
    const allowedParameters = [...parsed.searchParams.keys()].every((key) => key === "transport");
    const transport = parsed.searchParams.get("transport");
    const port = parsed.port ? Number(parsed.port) : null;
    return Boolean(
      parsed.hostname
      && !parsed.username
      && !parsed.password
      && (parsed.pathname === "/" || parsed.pathname === "")
      && allowedParameters
      && (!transport || transport === "udp" || transport === "tcp")
      && (port === null || (Number.isInteger(port) && port >= 1 && port <= 65535)),
    );
  } catch {
    return false;
  }
}

export function parseTurnUrls(rawUrls: string) {
  const urls = rawUrls
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(isValidTurnUrl);
  return [...new Set(urls)];
}

export function createTurnUsername(userId: number, callId: string, expiresAt: number) {
  return `${expiresAt}:user-${userId}:call-${callId}`;
}

export function createTurnCredential(sharedSecret: string, username: string) {
  return createHmac("sha1", sharedSecret).update(username).digest("base64");
}

export function getTurnCredential(
  environment: P2pTurnEnvironment,
  identity: { userId: number; callId: string },
  now = Date.now(),
): TurnCredential | null {
  const urls = parseTurnUrls(environment.turnUrls);
  if (!urls.length) return null;

  if (environment.turnSharedSecret) {
    const expiresAt = Math.floor(now / 1000) + P2P_TURN_TTL_SECONDS;
    const username = createTurnUsername(identity.userId, identity.callId, expiresAt);
    return {
      urls,
      username,
      credential: createTurnCredential(environment.turnSharedSecret, username),
      expiresAt,
      authMode: "shared-secret",
    };
  }

  if (environment.turnUsername.trim() && environment.turnCredential) {
    return {
      urls,
      username: environment.turnUsername.trim(),
      credential: environment.turnCredential,
      expiresAt: 0,
      authMode: "static",
    };
  }

  return null;
}

export function getP2pIceConfiguration(
  environment: P2pTurnEnvironment,
  identity: { userId: number; callId: string },
  now = Date.now(),
) {
  const turn = getTurnCredential(environment, identity, now);
  const iceServers: IceServer[] = [{ urls: DEFAULT_STUN_URLS }];
  if (turn) iceServers.push({ urls: turn.urls, username: turn.username, credential: turn.credential });
  return { iceServers, hasTurn: Boolean(turn), turn };
}
