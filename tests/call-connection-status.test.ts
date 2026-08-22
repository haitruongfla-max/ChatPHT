import { describe, expect, it } from "vitest";

import { getCallConnectionStatus } from "../lib/call-connection-status";

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
});
