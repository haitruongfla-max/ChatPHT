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

type WebRTCCallLifecycle = {
  id: string;
  conversationId: number;
  callerId: number;
  recipientId: number;
  p2pMode: "audio" | "video" | "screen";
  status: "ringing" | "accepted" | "active" | "declined" | "ended" | "missed";
  createdAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
};

let realtimeServer: Server | null = null;

function conversationRoom(conversationId: number) {
  return `conversation:${conversationId}`;
}

function userRoom(userId: number) {
  return `user:${userId}`;
}

function lifecyclePayload(session: WebRTCCallLifecycle) {
  return {
    callId: session.id,
    conversationId: session.conversationId,
    callerId: session.callerId,
    recipientId: session.recipientId,
    mode: session.p2pMode === "audio" ? "voice" : session.p2pMode,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    answeredAt: session.answeredAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
  };
}

/** Mời chỉ gửi tới room tài khoản người nhận đang có kết nối, không phụ thuộc route chat đang mount. */
export function emitWebRTCCallInvite(session: WebRTCCallLifecycle) {
  realtimeServer?.to(userRoom(session.recipientId)).emit("webrtc_call_invite", lifecyclePayload(session));
}

/** Đồng bộ mốc nhận/từ chối/kết thúc với cả hai tài khoản trong phiên đã được database xác nhận. */
export function emitWebRTCCallLifecycle(session: WebRTCCallLifecycle) {
  const payload = lifecyclePayload(session);
  realtimeServer?.to(userRoom(session.callerId)).emit("webrtc_call_lifecycle", payload);
  realtimeServer?.to(userRoom(session.recipientId)).emit("webrtc_call_lifecycle", payload);
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

    // SDP và ICE chỉ relay tới peer của phiên 1:1 đang active. Không lưu dữ liệu media
    // vào database và không dựa vào việc người nhận có đang mở đúng màn chat hay không.
    socket.on("webrtc_call_signal", (payload: WebRTCCallSignal, acknowledge?: (result: SignalingAcknowledgement) => void) => {
      const conversationId = typeof payload?.conversationId === "number" ? payload.conversationId : Number.NaN;
      const callId = typeof payload?.callId === "string" ? payload.callId.trim() : "";
      const mode = typeof payload?.mode === "string" ? payload.mode : "";
      const type = typeof payload?.type === "string" ? payload.type : "";
      const allowedModes = new Set(["voice", "video", "screen"]);
      const allowedTypes = new Set(["offer", "answer", "candidate"]);
      if (
        !Number.isInteger(conversationId) || conversationId <= 0 ||
        callId.length < 8 || callId.length > 128 ||
        !allowedModes.has(mode) || !allowedTypes.has(type)
      ) {
        acknowledge?.({ ok: false, error: "Tín hiệu gọi không hợp lệ." });
        return;
      }

      const userId = Number(socket.data.userId);
      void db.getWebRTCCallForParticipant(callId, userId)
        .then((session) => {
          const storedMode = mode === "voice" ? "audio" : mode;
          if (!session || session.conversationId !== conversationId || session.p2pMode !== storedMode || !["accepted", "active"].includes(session.status)) {
            acknowledge?.({ ok: false, error: "Phiên gọi không còn hoạt động hoặc bạn không có quyền gửi tín hiệu." });
            return;
          }
          if ((type === "offer" && session.callerId !== userId) || (type === "answer" && session.recipientId !== userId)) {
            acknowledge?.({ ok: false, error: "Thứ tự offer/answer của phiên gọi không hợp lệ." });
            return;
          }
          const peerId = session.callerId === userId ? session.recipientId : session.callerId;
          const message = {
            conversationId,
            callId,
            mode,
            type,
            payload: payload.payload && typeof payload.payload === "object" ? payload.payload : undefined,
            fromUserId: userId,
          };
          realtimeServer?.to(userRoom(peerId)).emit("webrtc_call_signal", message);
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
