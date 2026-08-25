import { io, type Socket } from "socket.io-client";

import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";

type P2pSignalAvailableEvent = {
  callId: string;
  signalId: number | null;
  type: "offer" | "answer" | "ice" | "screen-start" | "screen-stop";
  createdAt: string;
};

/**
 * Fast-path notification only. Signal contents are never carried through the
 * socket: the call coordinator drains them through protected tRPC/MySQL.
 */
export function subscribeToP2pSignalAvailability(callId: string, onAvailable: () => void) {
  let socket: Socket | null = null;
  let disposed = false;
  const seenSignalIds = new Set<number>();

  void getSessionToken().then((token) => {
    if (!token || disposed) return;
    socket = io(getApiBaseUrl(), {
      path: "/api/realtime",
      transports: ["websocket"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
    });
    socket.on("p2p_signal_available", (event: P2pSignalAvailableEvent) => {
      if (event?.callId !== callId) return;
      if (typeof event.signalId === "number") {
        if (seenSignalIds.has(event.signalId)) return;
        seenSignalIds.add(event.signalId);
      }
      onAvailable();
    });
  }).catch(() => undefined);

  return () => {
    disposed = true;
    socket?.disconnect();
  };
}
