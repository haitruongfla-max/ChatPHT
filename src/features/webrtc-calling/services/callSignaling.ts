import { getSessionToken } from "@/lib/_core/auth";
import { getApiBaseUrl } from "@/constants/oauth";
import { io, type Socket } from "socket.io-client";

import type { CallLifecycleEvent, CallSignal } from "../types";

type Acknowledgement = { ok: boolean; error?: string };

type SignalingListener = {
  onSignal?: (signal: CallSignal) => void;
  onInvite?: (event: CallLifecycleEvent) => void;
  onLifecycle?: (event: CallLifecycleEvent) => void;
};

let socket: Socket | null = null;
const listeners = new Set<SignalingListener>();

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

/**
 * Một kết nối Socket.IO xác thực duy nhất cho toàn bộ tài khoản. Server tự đưa socket
 * vào room `user:<id>`, vì vậy lời mời không còn phụ thuộc màn hình chat đang mount.
 */
export const callSignaling = {
  async connect() {
    if (socket?.connected) return;
    if (socket) socket.disconnect();
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
      socket.on("webrtc_call_signal", (event: CallSignal) => listeners.forEach((listener) => listener.onSignal?.(event)));
      socket.on("webrtc_call_invite", (event: CallLifecycleEvent) => listeners.forEach((listener) => listener.onInvite?.(event)));
      socket.on("webrtc_call_lifecycle", (event: CallLifecycleEvent) => listeners.forEach((listener) => listener.onLifecycle?.(event)));
  },
  async send(signal: CallSignal) {
    await this.connect();
    const result = await awaitAcknowledgement("webrtc_call_signal", signal);
    if (!result.ok) throw new Error(result.error ?? "Không thể gửi tín hiệu cuộc gọi.");
  },
  subscribe(listener: SignalingListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  disconnect() {
    socket?.disconnect();
    socket = null;
  },
};
