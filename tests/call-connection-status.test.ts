import { describe, expect, it } from "vitest";

import { getCallConnectionStatus, getP2pNetworkQuality } from "../lib/call-connection-status";

describe("call connection status", () => {
  it("mô tả rõ bước thiết lập video và các thiết bị đang được mở", () => {
    expect(getCallConnectionStatus({
      kind: "video",
      direction: "outgoing",
      detailsLoading: false,
      isConnecting: true,
      connected: false,
      isAnswered: false,
      error: null,
    })).toMatchObject({
      phase: "connecting",
      title: "Đang thiết lập cuộc gọi video",
      description: "Đang mở camera, micro và đường truyền bảo mật…",
    });
  });

  it("phân biệt đang gọi, đổ chuông và đã kết nối", () => {
    const base = { kind: "audio" as const, direction: "outgoing" as const, detailsLoading: false, isConnecting: false, error: null };

    expect(getCallConnectionStatus({ ...base, connected: false, isAnswered: false })).toMatchObject({ phase: "ringing", title: "Đang gọi…" });
    expect(getCallConnectionStatus({ ...base, connected: true, isAnswered: false })).toMatchObject({ phase: "ringing", title: "Đang đổ chuông…" });
    expect(getCallConnectionStatus({ ...base, connected: true, isAnswered: true })).toMatchObject({ phase: "connected", title: "Đã kết nối" });
  });

  it("ưu tiên lỗi kết nối và giữ nội dung có thể hành động", () => {
    expect(getCallConnectionStatus({
      kind: "video",
      direction: "incoming",
      detailsLoading: false,
      isConnecting: false,
      connected: false,
      isAnswered: false,
      error: "Mạng không ổn định. Vui lòng thử lại.",
    })).toMatchObject({
      phase: "error",
      title: "Không thể kết nối",
      description: "Mạng không ổn định. Vui lòng thử lại.",
    });
  });

  it("ánh xạ chất lượng mạng chỉ từ trạng thái ICE/WebRTC đã xác thực", () => {
    expect(getP2pNetworkQuality("idle")).toMatchObject({ level: "connecting", label: "Đang kết nối" });
    expect(getP2pNetworkQuality("connecting")).toMatchObject({ level: "connecting" });
    expect(getP2pNetworkQuality("connected")).toMatchObject({ level: "good", label: "Đã kết nối P2P", latencyMs: null });
    expect(getP2pNetworkQuality("connected", 42)).toMatchObject({ level: "good", label: "Độ trễ 42 ms", latencyMs: 42 });
    expect(getP2pNetworkQuality("connected", 210)).toMatchObject({ level: "weak", label: "Độ trễ 210 ms", latencyMs: 210 });
    expect(getP2pNetworkQuality("recovering")).toMatchObject({ level: "weak", label: "Mạng đang khôi phục" });
    expect(getP2pNetworkQuality("failed")).toMatchObject({ level: "offline", label: "Kết nối đã ngắt" });
    expect(getP2pNetworkQuality("closed")).toMatchObject({ level: "offline" });
  });

  it("ưu tiên trạng thái khôi phục thay vì báo lỗi kết nối chung chung", () => {
    expect(getCallConnectionStatus({
      kind: "video",
      direction: "incoming",
      detailsLoading: false,
      isConnecting: false,
      connected: false,
      isAnswered: true,
      error: null,
      networkState: "recovering",
    })).toMatchObject({
      phase: "recovering",
      title: "Đang khôi phục kết nối",
    });
  });
});
