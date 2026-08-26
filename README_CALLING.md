# WebRTC Calling cho ChatPHT

Module **`src/features/webrtc-calling`** cung cấp ba chế độ gọi 1:1 dùng chung một core `useWebRTC`:

| Chế độ | Media khởi tạo | Điều khiển |
| --- | --- | --- |
| Gọi thoại | Micro | Tắt/mở micro, loa trong/loa ngoài, kết thúc |
| Gọi video | Micro và camera | Micro, camera, đổi camera trước/sau, loa, chia sẻ màn hình, kết thúc |
| Chia sẻ màn hình | Micro và màn hình | Micro, loa, kết thúc; Android hiển thị hộp xác nhận hệ thống |

## Phạm vi và kiến trúc

Mọi peer connection, media stream, ICE candidate queue, thay track và cleanup chỉ nằm trong `hooks/useWebRTC.ts`. Các component `VoiceCall`, `VideoCall`, `ScreenShare` và `CallControls` chỉ hiển thị UI và gọi cùng controller này; chúng không tạo socket hay `RTCPeerConnection` riêng.

Signaling dùng Socket.IO `/api/realtime` sẵn có. Khi xác thực, socket vào room ổn định `user:<id>`; vì vậy lời mời đến không còn phụ thuộc người nhận đang mở đúng màn chat. Server tạo và kiểm tra phiên gọi 1:1 trong `call_sessions`, gửi `webrtc_call_invite` và lifecycle tới đúng người dùng; sau khi người nhận chấp nhận mới relay `offer`, `answer`, `candidate` tới peer của phiên đang active. SDP/ICE không được lưu vào MySQL. Nhóm không có nút gọi và không thể relay signaling.

`CallingManager` được mount một lần tại root app và sở hữu controller duy nhất. Các nút header chat 1:1 chỉ yêu cầu controller này bắt đầu cuộc gọi, do đó không có peer connection thứ hai cạnh tranh với overlay khi người dùng đổi route.

> `react-native-webrtc` là native module. Expo Go không chứa module này; cần dùng APK development/release mới được build sau khi tích hợp.

## Bật và tắt

Ba nút **gọi thoại**, **gọi video** và **chia sẻ màn hình** chỉ xuất hiện ở header chat 1:1. Overlay cuộc gọi thuộc `components/calling-manager.tsx`; các nút ở `app/chat/[id].tsx` không tự tạo socket, media stream hay peer connection. Không áp dụng bất kỳ call control nào cho nhóm.

Trong lúc gọi video, nút chia sẻ màn hình thay video gửi đi bằng `replaceTrack`; khi dừng, camera được thay trở lại mà không tạo lại peer connection. Nếu nền tảng trả về track audio của màn hình, core sẽ gửi track đó qua phiên gọi hiện hữu; nếu không, cuộc gọi vẫn giữ micro. Trên trình duyệt, người dùng tự chọn toàn màn hình/cửa sổ/tab và quyền system-audio phụ thuộc trình duyệt. Trên Android, hệ điều hành quyết định quyền capture và audio màn hình thực tế.

## Cấu hình ICE và TURN

Nguồn cấu hình chạy là `src/features/webrtc-calling/config/iceServers.js`. STUN được ưu tiên tự động; WebRTC sẽ dùng TURN nếu đường P2P trực tiếp không tạo được candidate pair hợp lệ. Khi peer connection thất bại, core thử một ICE restart trên cùng phiên trước khi báo lỗi. Để thay TURN, chỉ thay các object `turn:` trong `ICE_SERVERS`, giữ `urls`, `username` và `credential` ở phía client phù hợp server TURN của bạn, rồi build APK mới.

Không đặt credential TURN bí mật dài hạn vào một APK phân phối rộng. Khi dùng TURN riêng, nên cấp credential ngắn hạn qua backend đã xác thực và tăng phiên bản APK nếu có thay đổi native.

## Trạng thái, âm báo và lịch sử

Khi caller đang chờ, app phát **ringback**; khi callee nhận lời mời trong lúc ứng dụng đang hoạt động, app phát **ringtone**. Hai player dùng `expo-audio`, lặp duy nhất một âm báo và được dừng/giải phóng khi nhận, từ chối, bỏ lỡ, kết thúc, lỗi hoặc unmount. Đây là âm báo trong ứng dụng đang chạy; ứng dụng đã bị hệ điều hành tắt cần một luồng push/native-call riêng, chưa được module này hứa hẹn.

Timer `MM:SS` chỉ bắt đầu sau `RTCPeerConnection.connectionState === "connected"`. Ping chỉ hiển thị khi `getStats()` trả `currentRoundTripTime` từ candidate pair/remote inbound RTP; nếu engine không công bố stats, UI hiển thị “Đang đo kết nối” thay vì số giả. Chat 1:1 hiển thị các phiên gần đây, gồm cuộc gọi nhỡ, từ chối hoặc đã nghe cùng timestamp server ghi nhận.

## Kiểm thử hai tab trình duyệt

1. Khởi động backend và Metro bằng `pnpm dev`, sau đó đăng nhập hai tài khoản khác nhau bằng hai profile trình duyệt khác nhau.
2. Tạo hoặc mở cùng một hội thoại trực tiếp; không dùng nhóm.
3. Ở tab A, bấm từng nút thoại/video/chia sẻ màn hình. Ở tab B, nhận cuộc gọi và cấp quyền trình duyệt.
4. Kiểm tra lần lượt micro, loa, tắt/mở camera, đổi camera (nếu thiết bị có), bật/tắt chia sẻ màn hình trong video và nút kết thúc cuộc gọi.
5. Kiểm tra cuộc gọi chỉ liên lạc trong đúng hội thoại, rồi chạy `pnpm test -- --pool=forks --maxWorkers=1 --minWorkers=1`.

## Kiểm thử Android

APK Android cần manifest từ plugin `withAndroidMediaProjection.js`, gồm `FOREGROUND_SERVICE_MEDIA_PROJECTION` và `MODIFY_AUDIO_SETTINGS`. Khi lần đầu share màn hình, Android phải hiển thị xác nhận hệ thống; người dùng có thể hủy và app phải về trạng thái kết thúc/thất bại an toàn. Cần nghiệm thu trên hai thiết bị Android thật trước khi coi audio, video, TURN và screen capture là đạt.
