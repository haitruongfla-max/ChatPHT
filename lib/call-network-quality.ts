export type LiveKitConnectionQuality = "excellent" | "good" | "poor" | "lost" | "unknown";

export type CallNetworkQuality = {
  label: string;
  detail: string;
  color: string;
  icon: "network-wifi" | "signal-wifi-statusbar-connected-no-internet-4" | "wifi-tethering-error";
};

export function getCallNetworkQuality({
  pingMs,
  connectionQuality,
}: {
  pingMs: number | null;
  connectionQuality: LiveKitConnectionQuality;
}): CallNetworkQuality {
  if (connectionQuality === "lost") {
    return { label: "Mất kết nối", detail: "Đang chờ mạng khôi phục", color: "#D6404B", icon: "wifi-tethering-error" };
  }

  if (pingMs === null) {
    return { label: "Đang đo mạng", detail: "Ping LiveKit chưa sẵn sàng", color: "#64748B", icon: "network-wifi" };
  }

  if (connectionQuality === "poor" || pingMs >= 250) {
    return { label: "Mạng yếu", detail: `Ping LiveKit ${pingMs} ms`, color: "#D97706", icon: "signal-wifi-statusbar-connected-no-internet-4" };
  }

  if (connectionQuality === "good" || pingMs >= 120) {
    return { label: "Mạng ổn định", detail: `Ping LiveKit ${pingMs} ms`, color: "#2563EB", icon: "network-wifi" };
  }

  return { label: "Mạng tốt", detail: `Ping LiveKit ${pingMs} ms`, color: "#168759", icon: "network-wifi" };
}
