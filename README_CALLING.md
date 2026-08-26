# WebRTC Calling cho ChatPHT

Module **`src/features/webrtc-calling`** cung cấp ba chế độ gọi 1:1 dùng chung một core `useWebRTC`:

| Chế độ | Media khởi tạo | Điều khiển |
| --- | --- | --- |
| Gọi thoại | Micro | Tắt/mở micro, loa trong/loa ngoài, kết thúc |
| Gọi video | Micro và camera | Micro, camera, đổi camera trước/sau, loa, chia sẻ màn hình, kết thúc |
| Chia sẻ màn hình | Micro và màn hình | Micro, loa, kết thúc; Android hiển thị hộp xác nhận hệ thống |

## Phạm vi và kiến trúc

Mọi peer connection, media stream, ICE candidate queue, thay track và cleanup chỉ nằm trong `hooks/useWebRTC.ts`. Các component `VoiceCall`, `VideoCall`, `ScreenShare` và `CallControls` chỉ hiển thị UI và gọi cùng controller này; chúng không tạo socket hay `RTCPeerConnection` riêng.

Signaling dùng Socket.IO `/api/realtime` sẵn có. Máy chủ chỉ relay `offer`, `answer`, `candidate` và `hangup` sau khi socket đã xác thực, vào đúng room hội thoại và qua kiểm tra thành viên chat **1:1**. SDP/ICE không được lưu vào MySQL. Nhóm không có nút gọi và không thể relay signaling.

> `react-native-webrtc` là native module. Expo Go không chứa module này; cần dùng APK development/release mới được build sau khi tích hợp.

## Bật và tắt

Ba nút **gọi thoại**, **gọi video** và **chia sẻ màn hình** chỉ xuất hiện ở header chat 1:1. Để tắt hoàn toàn bề mặt gọi, bỏ phần `CallingOverlay` và cụm `callActions` ở `app/chat/[id].tsx`; không cần sửa core chat, media, presence hay database.

Trong lúc gọi video, nút chia sẻ màn hình thay video gửi đi bằng `replaceTrack`; khi dừng, camera được thay trở lại mà không tạo lại peer connection. Nếu nền tảng trả về track audio của màn hình, core sẽ gửi track đó qua phiên gọi hiện hữu; nếu không, cuộc gọi vẫn giữ micro. Trên trình duyệt, người dùng tự chọn toàn màn hình/cửa sổ/tab và quyền system-audio phụ thuộc trình duyệt. Trên Android, hệ điều hành quyết định quyền capture và audio màn hình thực tế.

## Cấu hình ICE và TURN

Nguồn cấu hình chạy là `src/features/webrtc-calling/config/iceServers.js`. STUN được ưu tiên tự động; WebRTC sẽ dùng TURN nếu đường P2P trực tiếp không tạo được candidate pair hợp lệ. Khi peer connection thất bại, core thử một ICE restart trên cùng phiên trước khi báo lỗi. Để thay TURN, chỉ thay các object `turn:` trong `ICE_SERVERS`, giữ `urls`, `username` và `credential` ở phía client phù hợp server TURN của bạn, rồi build APK mới.

Không đặt credential TURN bí mật dài hạn vào một APK phân phối rộng. Khi dùng TURN riêng, nên cấp credential ngắn hạn qua backend đã xác thực và tăng phiên bản APK nếu có thay đổi native.

## Kiểm thử hai tab trình duyệt

1. Khởi động backend và Metro bằng `pnpm dev`, sau đó đăng nhập hai tài khoản khác nhau bằng hai profile trình duyệt khác nhau.
2. Tạo hoặc mở cùng một hội thoại trực tiếp; không dùng nhóm.
3. Ở tab A, bấm từng nút thoại/video/chia sẻ màn hình. Ở tab B, nhận cuộc gọi và cấp quyền trình duyệt.
4. Kiểm tra lần lượt micro, loa, tắt/mở camera, đổi camera (nếu thiết bị có), bật/tắt chia sẻ màn hình trong video và nút kết thúc cuộc gọi.
5. Kiểm tra cuộc gọi chỉ liên lạc trong đúng hội thoại, rồi chạy `pnpm test -- --pool=forks --maxWorkers=1 --minWorkers=1`.

## Kiểm thử Android

APK Android cần manifest từ plugin `withAndroidMediaProjection.js`, gồm `FOREGROUND_SERVICE_MEDIA_PROJECTION` và `MODIFY_AUDIO_SETTINGS`. Khi lần đầu share màn hình, Android phải hiển thị xác nhận hệ thống; người dùng có thể hủy và app phải về trạng thái kết thúc/thất bại an toàn. Cần nghiệm thu trên hai thiết bị Android thật trước khi coi audio, video, TURN và screen capture là đạt.
