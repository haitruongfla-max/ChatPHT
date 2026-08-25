# Ranh giới gỡ ba tính năng gọi

Ngày 25-08-2026, các thành phần chỉ phục vụ gọi P2P 1:1 đã được xác định gồm plugin `@config-plugins/react-native-webrtc`, plugin Android P2P nội bộ, `react-native-webrtc`, `expo-pip`, route/overlay cuộc gọi và endpoint signaling/telemetry/TURN.

`expo-camera`, quyền camera/microphone của nó, `expo-audio`, `expo-video` và PiP của `expo-video` được giữ lại vì chúng vẫn phục vụ quay/gửi media và xem video trong chat. Schema MySQL cùng dữ liệu call lịch sử cũng được giữ nguyên để không có migration phá dữ liệu; client và router mới không còn bề mặt gọi.
