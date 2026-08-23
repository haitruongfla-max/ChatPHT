import { io, type Socket } from "socket.io-client";

import { getApiBaseUrl } from "@/constants/oauth";
import { getSessionToken } from "@/lib/_core/auth";

type BackgroundUpdatedEvent = {
  conversationId: number;
  updatedAt: string;
};

/**
 * Subscribes only to the active conversation. The server verifies the signed
 * session and conversation membership again before adding this socket to room.
 */
export function subscribeToConversationBackground(
  conversationId: number,
  onUpdated: (event: BackgroundUpdatedEvent) => void,
) {
  let socket: Socket | null = null;
  let disposed = false;

  void getSessionToken().then((token) => {
    if (!token || disposed) return;
    socket = io(getApiBaseUrl(), {
      path: "/api/realtime",
      transports: ["websocket"],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 4,
    });
    socket.on("connect", () => {
      socket?.emit("join_conversation", { conversationId });
    });
    socket.on("background_updated", (event: BackgroundUpdatedEvent) => {
      if (event?.conversationId === conversationId) onUpdated(event);
    });
  }).catch(() => undefined);

  return () => {
    disposed = true;
    socket?.emit("leave_conversation", { conversationId });
    socket?.disconnect();
  };
}
