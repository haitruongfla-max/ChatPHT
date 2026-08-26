# ChatPHT 1.0.41 — WebRTC Calling Lifecycle

## Nhận cuộc gọi và kết nối 1:1

- Lời mời gọi 1:1 nay được định tuyến theo tài khoản đã xác thực thay vì phụ thuộc người nhận đang mở đúng màn chat. Khi ứng dụng đang hoạt động, người nhận có thể thấy overlay nhận/từ chối từ inbox hoặc route khác.
- Server ghi nhận lifecycle cuộc gọi gồm đổ chuông, đã nhận, từ chối, kết thúc và cuộc gọi nhỡ trong phiên 1:1 có xác thực. SDP và ICE candidate vẫn chỉ relay tức thời, không được lưu vào MySQL.
- Caller chỉ bắt đầu offer sau khi callee chấp nhận. Ở trạng thái đổ chuông, người gọi chỉ có thể hủy; người nhận mới thấy Từ chối và Trả lời.

## Âm báo, chỉ số và lịch sử

- Thêm nhạc chờ cho người gọi và nhạc chuông cho người nhận. Âm thanh được dừng và giải phóng khi cuộc gọi đổi trạng thái hoặc kết thúc.
- Màn hình thoại, video và chia sẻ màn hình hiển thị thời lượng chỉ sau khi peer thực sự connected. Ping dùng WebRTC `getStats()`; nếu engine không trả dữ liệu thì app hiển thị trạng thái đang đo thay vì số giả.
- Chat 1:1 có card lịch sử tối đa sáu phiên gần nhất, hiển thị cuộc gọi nhỡ, từ chối hoặc đã nghe cùng thời điểm server ghi nhận.

## Lưu ý kiểm thử

- APK này cần dùng để kiểm thử WebRTC native; Expo Go không chứa `react-native-webrtc`.
- Chưa thể khẳng định audio/video/screen capture đã đạt trên hai Android thật hoặc khi app bị hệ điều hành tắt. Cuộc gọi app-killed cần push/native-call riêng và không nằm trong phạm vi bản này.
- Các chức năng chat, media, xóa lịch sử, hiện diện, nhóm, quản trị và cập nhật GitHub được giữ nguyên.
