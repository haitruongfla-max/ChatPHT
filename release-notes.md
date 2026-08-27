# ChatPHT 1.0.43 — Stability Recovery

## Khôi phục độ ổn định chat

- Giảm đáng kể tần suất polling ở hộp thư, hội thoại, trạng thái gõ, hiện diện và lịch sử gọi để tránh bão request, giảm giật giao diện và giảm nguy cơ backend/proxy trả HTTP 429.
- Khi backend đang giới hạn yêu cầu, ứng dụng tôn trọng thời gian chờ và không nhân đôi retry. Phản hồi HTML/non-JSON tiếp tục được báo rõ thay vì gây lỗi parse mơ hồ.
- Bỏ một invalidation không cần thiết sau khi đánh dấu đã đọc, giảm tải lại danh sách tin khi người dùng chỉ mở hội thoại.

## Ổn định gọi 1:1

- Socket.IO vẫn là đường signaling chính. Khi event lời mời tạm rơi, ứng dụng dùng truy vấn cuộc gọi đến làm đường dự phòng để máy nhận còn đang mở app có thể nhìn thấy lời mời.
- Gia cố các thao tác native nhạy cảm khi xử lý tín hiệu, đổi camera, đổi loa, dừng chia sẻ màn hình và giải phóng peer/track. Lỗi riêng lẻ được ghi thành trạng thái có thể đóng thay vì làm chặn cleanup giao diện.

## Lưu ý nghiệm thu

- Bản này đã qua kiểm thử nguồn và hồi quy tự động. Cần tiếp tục thử gửi text, mở hội thoại và gọi Voice/Video/Screen bằng **hai Android thật**, trước trên Wi-Fi rồi qua 4G.
- Chưa khẳng định audio, video hoặc chia sẻ màn hình P2P hoạt động trên thiết bị thật nếu chưa có nghiệm thu hai máy. Trường hợp ứng dụng bị hệ điều hành tắt hẳn vẫn cần push/native-call riêng để báo cuộc gọi đến.
