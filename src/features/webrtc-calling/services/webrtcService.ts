import { Platform } from "react-native";

// File entrypoint không được export cứng implementation web: Metro sẽ ưu tiên
// file `.ts` này trên Android. Chọn rõ native ở runtime để Voice/Video/Screen
// đều dùng react-native-webrtc trên thiết bị, còn web giữ implementation WebRTC
// chuẩn trình duyệt. Hai require đều là module cục bộ và không khởi tạo media.
const implementation = Platform.OS === "web"
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- chỉ nạp adapter web khi chạy web.
  ? require("./webrtcService.web")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Android/iOS phải nạp react-native-webrtc.
  : require("./webrtcService.native");

export const webrtcService = implementation.webrtcService as typeof import("./webrtcService.native").webrtcService;
