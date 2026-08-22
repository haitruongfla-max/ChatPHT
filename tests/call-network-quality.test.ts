import { describe, expect, it } from "vitest";

import { getCallNetworkQuality } from "../lib/call-network-quality";

describe("call network quality", () => {
  it("hiển thị ping LiveKit và mức mạng tốt khi độ trễ thấp", () => {
    expect(getCallNetworkQuality({ pingMs: 48, connectionQuality: "excellent" })).toMatchObject({
      label: "Mạng tốt",
      detail: "Ping LiveKit 48 ms",
      color: "#168759",
    });
  });

  it("cảnh báo mạng yếu khi LiveKit báo poor hoặc độ trễ cao", () => {
    expect(getCallNetworkQuality({ pingMs: 312, connectionQuality: "good" })).toMatchObject({
      label: "Mạng yếu",
      detail: "Ping LiveKit 312 ms",
      color: "#D97706",
    });
  });

  it("không dựng số ping khi SDK chưa đo được và phân biệt mất kết nối", () => {
    expect(getCallNetworkQuality({ pingMs: null, connectionQuality: "unknown" })).toMatchObject({ label: "Đang đo mạng" });
    expect(getCallNetworkQuality({ pingMs: 0, connectionQuality: "lost" })).toMatchObject({ label: "Mất kết nối" });
  });
});
