# ChatPHT 1.0.40 — WebRTC Calling

## Gọi 1:1 tách biệt

- Bổ sung module `webrtc-calling` độc lập với một core WebRTC chung cho **gọi thoại**, **gọi video** và **chia sẻ màn hình** trong chat 1:1.
- Ba nút ở đầu chat mở ba chế độ riêng: thoại dùng micro; video dùng micro và camera; chia sẻ màn hình mở hộp xác nhận hệ thống Android hoặc bộ chọn toàn màn hình/cửa sổ/tab trên trình duyệt.
- Trong cuộc gọi video, có thể bật chia sẻ màn hình rồi quay lại camera bằng thay track, không tạo peer connection thứ hai. Điều khiển gồm tắt/mở micro, camera, đổi camera trước/sau trên Android, loa trong/ngoài và kết thúc.

## Kết nối và an toàn

- Signaling dùng Socket.IO xác thực sẵn có; chỉ hai thành viên của một chat trực tiếp mới được relay offer, answer, ICE candidate hoặc kết thúc cuộc gọi. Nhóm không có bề mặt gọi.
- Ưu tiên STUN P2P; TURN OpenRelay chỉ là dự phòng theo cơ chế ICE. SDP và ICE candidate không được lưu vào MySQL.
- Cần cấp quyền micro/camera và xác nhận MediaProjection của Android khi chia sẻ màn hình. Expo Go không chứa WebRTC native; hãy dùng APK này để thử tính năng.

## Giữ nguyên tính năng hiện hữu

- Chat riêng/nhóm, gửi media, xóa lịch sử, hiện diện, thông báo, trình cập nhật GitHub và quản trị nhóm vẫn được giữ nguyên.
- Đã qua kiểm thử nguồn, web export và kiểm tra cấu hình Android; cần nghiệm thu cuộc gọi thật bằng hai thiết bị Android/mạng khác nhau trước khi dùng diện rộng.
