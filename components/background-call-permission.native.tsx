import AsyncStorage from "@react-native-async-storage/async-storage";
import { openBackgroundCallSettings } from "@/lib/background-call-settings";
import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";

const BACKGROUND_CALL_PROMPT_KEY = "chatpht.background-call-optimization.v1";

export function BackgroundCallPermission() {
  const prompted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android" || prompted.current) return;
    prompted.current = true;
    let active = true;
    const timer = setTimeout(() => {
      void AsyncStorage.getItem(BACKGROUND_CALL_PROMPT_KEY).then((saved) => {
        if (!active || saved) return;
        Alert.alert(
          "Cho phép ChatPHT chạy nền để nhận tin nhắn/cuộc gọi khi tắt app?",
          "ChatPHT sẽ mở trang Cài đặt Pin để bạn tự chọn Không hạn chế. Với Xiaomi/Oppo, ứng dụng sẽ mở thêm trang Tự khởi chạy nếu thiết bị hỗ trợ.",
          [
            { text: "Để sau", style: "cancel", onPress: () => void AsyncStorage.setItem(BACKGROUND_CALL_PROMPT_KEY, "deferred") },
            {
              text: "Đồng ý",
              onPress: () => {
                void AsyncStorage.setItem(BACKGROUND_CALL_PROMPT_KEY, "accepted");
                void openBackgroundCallSettings().then((result) => {
                  if (!result.openedBatterySettings) {
                    Alert.alert("Chưa thể mở cài đặt Pin", "Bạn có thể vào Cài đặt > Bảo mật & thông báo trong ChatPHT để thử lại.");
                  }
                });
              },
            },
          ],
        );
      });
    }, 900);
    return () => { active = false; clearTimeout(timer); };
  }, []);

  return null;
}
