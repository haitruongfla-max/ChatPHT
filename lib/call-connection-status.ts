export type CallConnectionKind = "audio" | "video";
export type CallConnectionDirection = "incoming" | "outgoing";
export type CallConnectionPhase = "preparing" | "connecting" | "ringing" | "connected" | "error";

export type CallConnectionStatus = {
  phase: CallConnectionPhase;
  title: string;
  description: string;
};

export function getCallConnectionStatus({
  kind,
  direction,
  detailsLoading,
  isConnecting,
  connected,
  isAnswered,
  error,
}: {
  kind: CallConnectionKind;
  direction: CallConnectionDirection;
  detailsLoading: boolean;
  isConnecting: boolean;
  connected: boolean;
  isAnswered: boolean;
  error: string | null;
}): CallConnectionStatus {
  const callType = kind === "video" ? "cuộc gọi video" : "cuộc gọi thoại";

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
