# Ghi chú kỹ thuật LiveKit Android

Tài liệu LiveKit xác nhận cuộc gọi React Native trên Android cần khai báo và xin tại thời điểm chạy ba quyền `CAMERA`, `RECORD_AUDIO` và `MODIFY_AUDIO_SETTINGS`. Luồng chuẩn là khởi động `AudioSession`, kết nối phòng, sau đó dùng `room.localParticipant.setMicrophoneEnabled(true)` và `room.localParticipant.setCameraEnabled(true)` để tạo, xuất bản track.

Với React Native, LiveKit yêu cầu `registerGlobals()` được gọi trước khi SDK tạo phòng hoặc track. Tài liệu quickstart cũng xác nhận `AudioSession.startAudioSession()` phải được gọi trước lúc tham gia phiên và các track camera có thể hiển thị qua `useTracks([Track.Source.Camera])` cùng `VideoTrack`.

## Nguồn

- [LiveKit: Camera & microphone](https://docs.livekit.io/transport/media/publish/)
- [LiveKit: React Native quickstart](https://docs.livekit.io/transport/sdk-platforms/react-native/)
- [LiveKit: Expo quickstart](https://docs.livekit.io/transport/sdk-platforms/expo/)

## Ghi chú Expo

Tài liệu Expo của LiveKit yêu cầu sử dụng **development build hoặc APK phát hành có plugin native**, không dùng Expo Go. Hai plugin `@livekit/react-native-expo-plugin` và `@config-plugins/react-native-webrtc` phải được đưa vào cấu hình build; `registerGlobals()` cần chạy trước khi tạo Room. Cấu hình nguồn của ChatPHT đã có các điều kiện này, vì vậy bản Android tiếp theo cần được xây dựng lại để thực sự nhận phần native đã cập nhật.
