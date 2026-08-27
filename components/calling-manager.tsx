import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { CallingOverlay } from "@/src/features/webrtc-calling/components/CallingOverlay";
import { useWebRTC } from "@/src/features/webrtc-calling/hooks/useWebRTC";
import type { CallMode } from "@/src/features/webrtc-calling/types";

type CallingContextValue = {
  startCall: (input: { conversationId: number; mode: CallMode; peerName: string }) => Promise<void>;
};

const CallingContext = createContext<CallingContextValue | null>(null);
const signedOutCallingValue: CallingContextValue = {
  startCall: async () => {
    throw new Error("Vui lòng đăng nhập trước khi thực hiện cuộc gọi.");
  },
};

/**
 * Sở hữu một controller WebRTC duy nhất trong toàn app. Vì manager sống cùng app shell,
 * Socket.IO vẫn nhận lời mời dành cho tài khoản khi người dùng đang ở inbox hoặc route khác.
 * App bị đóng hẳn vẫn cần push notification/native call riêng, không được giả định là đã hỗ trợ.
 */
export function CallingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) {
    return <CallingContext.Provider value={signedOutCallingValue}>{children}</CallingContext.Provider>;
  }

  return <AuthenticatedCallingProvider userId={user.id}>{children}</AuthenticatedCallingProvider>;
}

/** Chỉ mount sau đăng nhập để useWebRTC không chạm native module ở màn hình login. */
function AuthenticatedCallingProvider({ children, userId }: { children: ReactNode; userId: number }) {
  const controller = useWebRTC({ userId });
  const [peerName, setPeerName] = useState("Liên hệ ChatPHT");
  const incoming = trpc.calling.incoming.useQuery(undefined, {
    refetchInterval: 8_000,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (controller.state.direction !== "incoming" || !controller.state.callId) return;
    const caller = incoming.data?.find((session) => session.id === controller.state.callId)?.caller;
    if (caller?.displayName) setPeerName(caller.displayName);
  }, [controller.state.callId, controller.state.direction, incoming.data]);

  // Socket.IO là đường chính. Query này là fallback khi thiết bị vừa mất socket hoặc
  // proxy làm rơi event; nhờ vậy caller không chỉ đổ chuông vô thời hạn.
  useEffect(() => {
    const session = incoming.data?.[0];
    if (!session || (controller.state.status !== "idle" && controller.state.status !== "ended")) return;
    controller.receiveIncomingCall({
      callId: session.id,
      conversationId: session.conversationId,
      callerId: session.callerId,
      recipientId: session.recipientId,
      mode: session.p2pMode === "audio" ? "voice" : session.p2pMode,
      status: "ringing",
      createdAt: new Date(session.createdAt).toISOString(),
      answeredAt: null,
      endedAt: null,
    });
  }, [controller, incoming.data]);

  const startCall = useCallback(async ({ conversationId, mode, peerName: nextPeerName }: { conversationId: number; mode: CallMode; peerName: string }) => {
    setPeerName(nextPeerName || "Liên hệ ChatPHT");
    await controller.startCall(conversationId, mode);
  }, [controller]);

  const value = useMemo(() => ({ startCall }), [startCall]);
  return (
    <CallingContext.Provider value={value}>
      {children}
      <CallingOverlay controller={controller} peerName={peerName} />
    </CallingContext.Provider>
  );
}

export function useCalling() {
  const value = useContext(CallingContext);
  if (!value) throw new Error("useCalling phải được dùng bên trong CallingProvider.");
  return value;
}
