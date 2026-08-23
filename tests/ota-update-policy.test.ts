import { describe, expect, it } from "vitest";

import { canCheckForOtaUpdate, OTA_FOREGROUND_CHECK_INTERVAL_MS } from "../lib/ota-update-policy";

describe("chính sách kiểm tra OTA có kiểm soát", () => {
  const eligible = {
    now: OTA_FOREGROUND_CHECK_INTERVAL_MS,
    lastCheckAt: 0,
    isNative: true,
    isEnabled: true,
    isCheckRunning: false,
    hasActiveCall: false,
  };

  it("cho phép kiểm tra khi app trở lại foreground sau khoảng throttle", () => {
    expect(canCheckForOtaUpdate(eligible)).toBe(true);
  });

  it("không kiểm tra hoặc tải lại khi đang gọi hay trong thời gian throttle", () => {
    expect(canCheckForOtaUpdate({ ...eligible, hasActiveCall: true })).toBe(false);
    expect(canCheckForOtaUpdate({ ...eligible, now: OTA_FOREGROUND_CHECK_INTERVAL_MS - 1 })).toBe(false);
    expect(canCheckForOtaUpdate({ ...eligible, isNative: false })).toBe(false);
  });
});
