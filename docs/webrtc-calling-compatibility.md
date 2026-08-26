# Ghi chú tương thích WebRTC Calling

Tài liệu này ghi nhận các nguồn kỹ thuật được kiểm tra ngày 26-08-2026 trước khi tái tích hợp WebRTC Calling. Đây là ghi chú thiết kế nội bộ, không chứa TURN credential riêng tư ngoài chuỗi công khai mà người dùng đã yêu cầu.

| Nội dung | Kết luận áp dụng cho ChatPHT | Nguồn |
|---|---|---|
| Expo SDK 54 | `react-native-webrtc` yêu cầu native code, vì vậy không chạy trong Expo Go; cần APK/custom development build mới. | [React Native WebRTC README](https://github.com/react-native-webrtc/react-native-webrtc) |
| Phiên bản tương thích | Bảng config plugin hiện hành ghép Expo SDK 54 với `react-native-webrtc` 124.0.6 và `@config-plugins/react-native-webrtc` 13.0.0. | [Config plugin package](https://www.npmjs.com/package/@config-plugins/react-native-webrtc) |
| API lõi | Module cung cấp `RTCPeerConnection`, `mediaDevices.getUserMedia`, `mediaDevices.getDisplayMedia`, `RTCView`, `RTCSessionDescription` và `RTCIceCandidate`; web cần shim hoặc WebRTC browser API tương đương. | [Basic Usage](https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/BasicUsage.md) |
| Chia sẻ màn hình Android | `getDisplayMedia` xin quyền khi chạy; Android 10 trở lên đòi foreground service đang hoạt động để capture hoạt động. | [Basic Usage](https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/BasicUsage.md) |
| Chuyển camera | Tài liệu hiện hành khuyến nghị `track.applyConstraints({ facingMode })`; không dùng `_switchCamera` đã deprecated. | [Basic Usage](https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/BasicUsage.md) |
| Android production | WebRTC yêu cầu tối thiểu API 24 và các quyền camera, microphone, network state, `MODIFY_AUDIO_SETTINGS`, Internet; từ 118.0.2 thư viện có foreground service cho screen share theo Android 14 khi khai báo quyền cần thiết. | [Android Installation](https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/AndroidInstallation.md) |

Quyết định triển khai: dùng Socket.IO xác thực đã có của ChatPHT thay vì mở máy chủ signaling thứ hai; giới hạn signaling theo membership của chat 1:1 và `callId`, không lưu SDP/candidate/credential vào MySQL. Browser sẽ dùng WebRTC chuẩn; Android dùng `react-native-webrtc` trong APK mới. Chia sẻ audio hệ thống và lựa chọn cửa sổ/tab là khả năng do hệ điều hành hoặc trình duyệt quyết định, do đó UI phải báo rõ khi nguồn không hỗ trợ thay vì hứa hẹn có trên Android.

## Quy tắc triển khai bắt buộc

`RTCPeerConnection` chỉ được tạo một lần cho mỗi `callId`. Hook phải chặn offer trùng khi `negotiationneeded` phát nhiều lần, gửi trickle ICE ngay khi sinh, đồng thời xếp candidate vào hàng đợi cho đến khi có `remoteDescription`. Khi kết thúc, toàn bộ track cục bộ phải được `stop()` và peer connection phải `close()` để lần gọi sau bắt đầu từ trạng thái sạch.

Với Android, `FOREGROUND_SERVICE` và `FOREGROUND_SERVICE_MEDIA_PROJECTION` là bắt buộc cho screen share; bản thư viện từ 118.0.2 đã gồm foreground service nhưng vẫn cần bật `WebRTCModuleOptions.enableMediaProjectionService` rất sớm ở native application. Đây là một thay đổi native, nên APK phát hành phải có runtime fingerprint mới; Expo Go và OTA không thể tự thêm khả năng này.
