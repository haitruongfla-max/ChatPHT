import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { Alert, AppState, Platform } from "react-native";

import { canCheckForOtaUpdate, OTA_FOREGROUND_CHECK_INTERVAL_MS } from "@/lib/ota-update-policy";
import { useAuth } from "@/hooks/use-auth";

/**
 * EAS Updates already checks on launch through app.config.ts. This manager adds a
 * controlled foreground check so a long-running session can receive a JS/TS OTA
 * update. Native changes still require an APK.
 */
export function OtaUpdateManager() {
  const { user } = useAuth();
  const lastCheckAt = useRef(0);
  const checkRunning = useRef(false);

  useEffect(() => {
    if (!user) return;
    async function checkForUpdate() {
      const now = Date.now();
      const allowed = canCheckForOtaUpdate({
        now,
        lastCheckAt: lastCheckAt.current,
        isNative: Platform.OS !== "web",
        isEnabled: Updates.isEnabled,
        isCheckRunning: checkRunning.current,
        hasActiveCall: false,
      });
      if (!allowed) return;

      checkRunning.current = true;
      lastCheckAt.current = now;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) return;

        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) return;

        Alert.alert(
          "Bản cập nhật đã sẵn sàng",
          "ChatPHT đã tải bản cập nhật an toàn. Chọn cập nhật để mở lại ứng dụng.",
          [
            { text: "Để sau", style: "cancel" },
            {
              text: "Cập nhật ngay",
              onPress: () => {
                void Updates.reloadAsync().catch(() => undefined);
              },
            },
          ],
        );
      } catch {
        // An OTA endpoint may be unavailable offline. The installed bundle remains usable.
      } finally {
        checkRunning.current = false;
      }
    }

    void checkForUpdate();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      // Do not perform repeated checks while users briefly switch apps.
      if (Date.now() - lastCheckAt.current < OTA_FOREGROUND_CHECK_INTERVAL_MS) return;
      void checkForUpdate();
    });
    return () => subscription.remove();
  }, [user]);

  return null;
}
