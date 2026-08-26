import { getSessionToken } from "@/lib/_core/auth";
import { getApiBaseUrl } from "@/constants/oauth";
import { io, type Socket } from "socket.io-client";

import type { CallSignal } from "../types";

type SignalingOptions = {
  conversationId: number;
  onSignal: (signal: CallSignal) => void;
};

type Acknowledgement = { ok: boolean; error?: string };

/**
 * Kết nối signaling ngắn hạn, xác thực bằng token trên native hoặc cookie trên web.
 * Không lưu SDP/candidate: Socket.IO chỉ relay cho phòng chat 1:1 đang hoạt động.
 */
export function createCallSignaling({ conversationId, onSignal }: SignalingOptions) {
  let socket: Socket | null = null;

  const awaitAcknowledgement = (event: string, payload: unknown) =>
    new Promise<Acknowledgement>((resolve) => {
      if (!socket) {
        resolve({ ok: false, error: "Kết nối signaling chưa sẵn sàng." });
        return;
      }
      socket.timeout(8_000).emit(event, payload, (error: Error | null, result?: Acknowledgement) => {
        if (error) resolve({ ok: false, error: "Máy chủ signaling không phản hồi." });
        else resolve(result ?? { ok: false, error: "Phản hồi signaling không hợp lệ." });
      });
    });

  return {
    async connect() {
      if (socket?.connected) return;
      const token = await getSessionToken();
      socket = io(getApiBaseUrl(), {
        path: "/api/realtime",
        transports: ["websocket", "polling"],
        withCredentials: true,
        auth: token ? { token } : undefined,
        reconnectionAttempts: 3,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Không thể kết nối signaling.")), 8_000);
        socket?.once("connect", () => {
          clearTimeout(timeout);
          resolve();
        });
        socket?.once("connect_error", () => {
          clearTimeout(timeout);
          reject(new Error("Phiên đăng nhập signaling không hợp lệ hoặc máy chủ không phản hồi."));
        });
      });
      socket.on("webrtc_call_signal", onSignal);
      const joined = await awaitAcknowledgement("join_conversation", { conversationId });
      if (!joined.ok) throw new Error(joined.error ?? "Bạn không có quyền gọi trong hội thoại này.");
    },
    async send(signal: CallSignal) {
      const result = await awaitAcknowledgement("webrtc_call_signal", signal);
      if (!result.ok) throw new Error(result.error ?? "Không thể gửi tín hiệu cuộc gọi.");
    },
    disconnect() {
      socket?.off("webrtc_call_signal", onSignal);
      socket?.emit("leave_conversation", { conversationId });
      socket?.disconnect();
      socket = null;
    },
  };
}
