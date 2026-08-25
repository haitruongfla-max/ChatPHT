import type { Server as HttpServer } from "node:http";
import type { Request as ExpressRequest } from "express";
import { Server, type Socket } from "socket.io";

import * as db from "../db";
import { sdk } from "./sdk";

type BackgroundUpdatedEvent = {
  conversationId: number;
  updatedAt: string;
};

type P2pSignalAvailableEvent = {
  recipientId: number;
  callId: string;
  signalId: number | null;
  type: "offer" | "answer" | "ice" | "screen-start" | "screen-stop";
  createdAt: string;
};

let realtimeServer: Server | null = null;

function conversationRoom(conversationId: number) {
  return `conversation:${conversationId}`;
}

function userRoom(userId: number) {
  return `user:${userId}`;
}

async function authenticateSocket(socket: Socket) {
  const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token.trim() : "";
  if (!token) throw new Error("Thiếu phiên đăng nhập.");
  return sdk.authenticateRequest({
    headers: { authorization: `Bearer ${token}` },
  } as unknown as ExpressRequest);
}

export function registerRealtime(server: HttpServer) {
  if (realtimeServer) return realtimeServer;
  realtimeServer = new Server(server, {
    path: "/api/realtime",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
  });
  realtimeServer.use((socket, next) => {
    void authenticateSocket(socket)
      .then((user) => {
        socket.data.userId = user.id;
        next();
      })
      .catch(() => next(new Error("Phiên đăng nhập không hợp lệ.")));
  });
  realtimeServer.on("connection", (socket) => {
    socket.join(userRoom(Number(socket.data.userId)));
    socket.on("join_conversation", (payload: { conversationId?: unknown }, acknowledge?: (result: { ok: boolean }) => void) => {
      const conversationId = typeof payload?.conversationId === "number" ? payload.conversationId : Number.NaN;
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        acknowledge?.({ ok: false });
        return;
      }
      void db.isConversationMember(conversationId, Number(socket.data.userId))
        .then((isMember) => {
          if (isMember) socket.join(conversationRoom(conversationId));
          acknowledge?.({ ok: isMember });
        })
        .catch(() => acknowledge?.({ ok: false }));
    });
    socket.on("leave_conversation", (payload: { conversationId?: unknown }) => {
      const conversationId = typeof payload?.conversationId === "number" ? payload.conversationId : Number.NaN;
      if (Number.isInteger(conversationId) && conversationId > 0) socket.leave(conversationRoom(conversationId));
    });
  });
  return realtimeServer;
}

export function emitConversationBackgroundUpdated(event: BackgroundUpdatedEvent) {
  realtimeServer?.to(conversationRoom(event.conversationId)).emit("background_updated", event);
}

/**
 * Only wakes the authenticated recipient to drain its protected MySQL queue.
 * SDP, ICE candidates and relay configuration remain exclusively inside the
 * existing protected tRPC mutation/query path.
 */
export function emitP2pSignalAvailable(event: P2pSignalAvailableEvent) {
  const { recipientId, ...safeEvent } = event;
  realtimeServer?.to(userRoom(recipientId)).emit("p2p_signal_available", safeEvent);
}
