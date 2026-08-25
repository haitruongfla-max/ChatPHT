import type { P2pConnectionState } from "@/lib/p2p-call";
import type { P2pCallMode } from "@/lib/p2p-call-mode";

export type CallConnectionKind = "audio" | "video" | "screen";
export type CallConnectionDirection = "incoming" | "outgoing";
export type CallConnectionPhase = "preparing" | "connecting" | "ringing" | "recovering" | "connected" | "error";

export type P2pNetworkQualityLevel = "connecting" | "good" | "weak" | "offline";

export type P2pNetworkQuality = {
  level: P2pNetworkQualityLevel;
  label: string;
  description: string;
  latencyMs: number | null;
};

export type CallConnectionStatus = {
  phase: CallConnectionPhase;
  title: string;
  description: string;
};

/**
 * Chỉ hiển thị trạng thái và độ trễ đã được WebRTC báo cáo; không suy đoán ping,
 * cũng không hiển thị SDP, ICE, TURN URLs hoặc thông tin bí mật.
 */
export function getP2pNetworkQuality(state: P2pConnectionState, latencyMs: number | null = null): P2pNetworkQuality {
  switch (state) {
    case "connected":
      if (latencyMs !== null && latencyMs > 180) return { level: "weak", label: `Độ trễ ${latencyMs} ms`, description: "Độ trễ được WebRTC đo trực tiếp; mạng có thể chậm.", latencyMs };
      if (latencyMs !== null) return { level: "good", label: `Độ trễ ${latencyMs} ms`, description: "Độ trễ được WebRTC đo trực tiếp trên kênh P2P.", latencyMs };
      return { level: "good", label: "Đã kết nối P2P", description: "Kênh P2P đang hoạt động; đang chờ số liệu độ trễ WebRTC.", latencyMs: null };
    case "recovering":
      return { level: "weak", label: "Mạng đang khôi phục", description: "Đang khôi phục P2P sau khi mạng thay đổi.", latencyMs: null };
    case "failed":
    case "closed":
      return { level: "offline", label: "Kết nối đã ngắt", description: "Kênh P2P không còn dùng được.", latencyMs: null };
    case "idle":
    case "connecting":
    default:
      return { level: "connecting", label: "Đang kết nối", description: "Đang thiết lập kênh P2P bảo mật.", latencyMs: null };
  }
}

export function getCallConnectionStatus({
  kind,
  p2pMode,
  direction,
  detailsLoading,
  isConnecting,
  connected,
  isAnswered,
  error,
  networkState,
}: {
  kind: CallConnectionKind;
  p2pMode?: P2pCallMode;
  direction: CallConnectionDirection;
  detailsLoading: boolean;
  isConnecting: boolean;
  connected: boolean;
  isAnswered: boolean;
  error: string | null;
  networkState?: P2pConnectionState;
}): CallConnectionStatus {
  const effectiveMode = p2pMode ?? kind;
  const callType = effectiveMode === "screen" ? "phiên chia sẻ màn hình" : effectiveMode === "video" ? "cuộc gọi video" : "cuộc gọi thoại";

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
      description: effectiveMode === "screen"
        ? "Đang chờ quyền chia sẻ màn hình và thiết lập đường truyền bảo mật…"
        : effectiveMode === "video"
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
    const request = effectiveMode === "screen" ? "yêu cầu chia sẻ màn hình" : effectiveMode === "video" ? "yêu cầu cuộc gọi video" : "yêu cầu cuộc gọi thoại";
    return {
      phase: "ringing",
      title: connected ? `Đang đổ chuông ${callType}…` : `Đang gọi ${callType}…`,
      description: connected
        ? "Đang chờ người nhận tham gia."
        : `Đang gửi ${request} đến người nhận.`,
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
    title: effectiveMode === "screen" ? "Yêu cầu chia sẻ màn hình đến" : effectiveMode === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến",
    description: "Chọn Nhận để bắt đầu kết nối.",
  };
}
