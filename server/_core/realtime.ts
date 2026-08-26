import type { Server as HttpServer } from "node:http";
import type { Request as ExpressRequest } from "express";
import { Server, type Socket } from "socket.io";

import * as db from "../db";
import { sdk } from "./sdk";

type BackgroundUpdatedEvent = {
  conversationId: number;
  updatedAt: string;
};

type WebRTCCallSignal = {
  conversationId?: unknown;
  callId?: unknown;
  mode?: unknown;
  type?: unknown;
  payload?: unknown;
};

type SignalingAcknowledgement = { ok: boolean; error?: string };

let realtimeServer: Server | null = null;

function conversationRoom(conversationId: number) {
  return `conversation:${conversationId}`;
}

async function authenticateSocket(socket: Socket) {
  const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token.trim() : "";
  const cookie = typeof socket.handshake.headers.cookie === "string" ? socket.handshake.headers.cookie : "";
  if (!token && !cookie) throw new Error("Thiếu phiên đăng nhập.");
  return sdk.authenticateRequest({
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
    },
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

    // SDP và ICE chỉ relay trong room chat 1:1. Không lưu nội dung vào database,
    // không cho nhóm dùng signaling này và không broadcast ra các conversation khác.
    socket.on("webrtc_call_signal", (payload: WebRTCCallSignal, acknowledge?: (result: SignalingAcknowledgement) => void) => {
      const conversationId = typeof payload?.conversationId === "number" ? payload.conversationId : Number.NaN;
      const callId = typeof payload?.callId === "string" ? payload.callId.trim() : "";
      const mode = typeof payload?.mode === "string" ? payload.mode : "";
      const type = typeof payload?.type === "string" ? payload.type : "";
      const allowedModes = new Set(["voice", "video", "screen"]);
      const allowedTypes = new Set(["offer", "answer", "candidate", "hangup"]);
      if (
        !Number.isInteger(conversationId) || conversationId <= 0 ||
        callId.length < 8 || callId.length > 128 ||
        !allowedModes.has(mode) || !allowedTypes.has(type) ||
        !socket.rooms.has(conversationRoom(conversationId))
      ) {
        acknowledge?.({ ok: false, error: "Tín hiệu gọi không hợp lệ hoặc hội thoại chưa được tham gia." });
        return;
      }

      void db.isDirectConversationMember(conversationId, Number(socket.data.userId))
        .then((isAllowed) => {
          if (!isAllowed) {
            acknowledge?.({ ok: false, error: "Chỉ hội thoại 1:1 mới có thể gọi." });
            return;
          }
          const message = {
            conversationId,
            callId,
            mode,
            type,
            payload: payload.payload && typeof payload.payload === "object" ? payload.payload : undefined,
            fromUserId: Number(socket.data.userId),
          };
          socket.to(conversationRoom(conversationId)).emit("webrtc_call_signal", message);
          acknowledge?.({ ok: true });
        })
        .catch(() => acknowledge?.({ ok: false, error: "Không thể xác minh quyền signaling." }));
    });
  });
  return realtimeServer;
}

export function emitConversationBackgroundUpdated(event: BackgroundUpdatedEvent) {
  realtimeServer?.to(conversationRoom(event.conversationId)).emit("background_updated", event);
}
