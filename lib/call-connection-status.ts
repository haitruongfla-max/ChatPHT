import type { P2pConnectionState } from "@/lib/p2p-call";

export type CallConnectionKind = "audio" | "video";
export type CallConnectionDirection = "incoming" | "outgoing";
export type CallConnectionPhase = "preparing" | "connecting" | "ringing" | "recovering" | "connected" | "error";

export type P2pNetworkQualityLevel = "connecting" | "good" | "weak" | "offline";

export type P2pNetworkQuality = {
  level: P2pNetworkQualityLevel;
  label: string;
  description: string;
};

export type CallConnectionStatus = {
  phase: CallConnectionPhase;
  title: string;
  description: string;
};

/**
 * Maps only verified WebRTC state to user-facing feedback. It deliberately
 * avoids estimating ping or exposing SDP, ICE candidates, TURN URLs or secrets.
 */
export function getP2pNetworkQuality(state: P2pConnectionState): P2pNetworkQuality {
  switch (state) {
    case "connected":
      return { level: "good", label: "Kết nối P2P tốt", description: "Kênh thoại/video trực tiếp đang hoạt động." };
    case "recovering":
      return { level: "weak", label: "Mạng đang khôi phục", description: "Đang khôi phục P2P sau khi mạng thay đổi." };
    case "failed":
    case "closed":
      return { level: "offline", label: "Kết nối đã ngắt", description: "Kênh P2P không còn dùng được." };
    case "idle":
    case "connecting":
    default:
      return { level: "connecting", label: "Đang kết nối", description: "Đang thiết lập kênh P2P bảo mật." };
  }
}

export function getCallConnectionStatus({
  kind,
  direction,
  detailsLoading,
  isConnecting,
  connected,
  isAnswered,
  error,
  networkState,
}: {
  kind: CallConnectionKind;
  direction: CallConnectionDirection;
  detailsLoading: boolean;
  isConnecting: boolean;
  connected: boolean;
  isAnswered: boolean;
  error: string | null;
  networkState?: P2pConnectionState;
}): CallConnectionStatus {
  const callType = kind === "video" ? "cuộc gọi video" : "cuộc gọi thoại";

  if (networkState === "recovering") {
    return {
      phase: "recovering",
      title: "Đang khôi phục kết nối",
      description: "Đã phát hiện thay đổi mạng. ChatPHT đang khôi phục kênh P2P…",
    };
  }

  if (error) {
    return {
      phase: "error",
      title: "Không thể kết nối",
      description: error.trim() || "Hãy thử lại khi mạng ổn định hơn.",
    };
  }

  if (isConnecting) {
    return {
      phase: "connecting",
      title: `Đang thiết lập ${callType}`,
      description: kind === "video"
        ? "Đang mở camera, micro và đường truyền bảo mật…"
        : "Đang mở micro và đường truyền bảo mật…",
    };
  }

  if (connected && isAnswered) {
    return {
      phase: "connected",
      title: "Đã kết nối",
      description: "Cuộc gọi đang được bảo mật qua Internet.",
    };
  }

  if (connected || direction === "outgoing") {
    return {
      phase: "ringing",
      title: connected ? "Đang đổ chuông…" : "Đang gọi…",
      description: connected
        ? "Đang chờ người nhận tham gia."
        : "Đang gửi yêu cầu cuộc gọi đến người nhận.",
    };
  }

  if (detailsLoading) {
    return {
      phase: "preparing",
      title: `Đang chuẩn bị ${callType}`,
      description: "Đang kiểm tra thông tin phiên gọi bảo mật…",
    };
  }

  return {
    phase: "preparing",
    title: kind === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến",
    description: "Chọn Nhận để bắt đầu kết nối.",
  };
}
