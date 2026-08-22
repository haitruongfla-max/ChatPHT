import type { Request, Response } from "express";
import * as db from "./db";
import { sdk, type AuthenticatedUser } from "./_core/sdk";
import { storageGetSignedUrl } from "./storage";

export const MEDIA_ACCESS_TTL_MS = 60 * 60 * 1000;

function encodeMediaKey(mediaKey: string) {
  return Buffer.from(mediaKey, "utf8").toString("base64url");
}

function decodeMediaKey(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 1024) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return decoded.length > 0 && decoded.length <= 512 && !decoded.includes("..") ? decoded : null;
  } catch {
    return null;
  }
}

function apiBaseUrl(req: Pick<Request, "headers" | "protocol">) {
  const host = req.headers?.host;
  if (!host) return "";
  const forwardedProtocol = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProtocol === "string" ? forwardedProtocol.split(",")[0] : req.protocol || "https";
  return `${protocol}://${host}`;
}

/** Cấp capability URL JWT ngắn hạn; payload vẫn bị kiểm tra lại quyền thành viên trước khi tải. */
export async function createMediaAccessUrl(req: Pick<Request, "headers" | "protocol">, user: Pick<AuthenticatedUser, "openId" | "name">, mediaKey: string) {
  const token = await sdk.createSessionToken(user.openId, {
    name: user.name ?? "ChatPHT media",
    scope: "media",
    expiresInMs: MEDIA_ACCESS_TTL_MS,
  });
  return `${apiBaseUrl(req)}/api/media/${encodeMediaKey(mediaKey)}?access_token=${encodeURIComponent(token)}`;
}

function mediaAccessToken(req: Request) {
  const token = req.query.access_token;
  return typeof token === "string" && token.length > 0 && token.length <= 4096 ? token : null;
}

async function authenticatedMediaUser(req: Request) {
  const queryToken = mediaAccessToken(req);
  const authorization = req.headers.authorization;
  if (!authorization && queryToken) req.headers.authorization = `Bearer ${queryToken}`;
  try {
    return await sdk.authenticateRequest(req);
  } finally {
    if (!authorization && queryToken) delete req.headers.authorization;
  }
}

export async function mediaDownloadHandler(req: Request, res: Response) {
  const mediaKey = decodeMediaKey(req.params.mediaKey);
  if (!mediaKey || !mediaAccessToken(req)) {
    return res.status(403).json({ error: "media-access-denied" });
  }

  try {
    const user = await authenticatedMediaUser(req);
    if (!user.isMediaAccessToken || user.isCron || db.isUserAccessExpired(user)) {
      return res.status(403).json({ error: "media-access-denied" });
    }

    const media = (await db.findAuthorizedConversationMedia(mediaKey, user.id))
      ?? (await db.findAuthorizedWallpaper(mediaKey, user.id))
      ?? (await db.findAuthorizedAvatar(mediaKey));
    if (!media) return res.status(403).json({ error: "media-access-denied" });

    const upstream = await fetch(await storageGetSignedUrl(mediaKey));
    if (!upstream.ok) {
      return res.status(502).json({ error: "media-storage-unavailable" });
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.status(200);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || media.mediaMime);
    res.setHeader("Content-Length", String(body.byteLength));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.end(body);
  } catch (error) {
    console.warn("[media] protected download denied", error instanceof Error ? error.message : String(error));
    return res.status(403).json({ error: "media-access-denied" });
  }
}
