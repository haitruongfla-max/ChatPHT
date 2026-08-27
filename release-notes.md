# ChatPHT 1.0.45 — FCM Incoming Call

## Thông báo tin nhắn rõ ràng hơn

- Thông báo tin nhắn mới hiện dùng **tên hiển thị người gửi** làm tiêu đề và phần xem trước nội dung làm phần thân; ví dụ: `Hải Trường` / `alo bạn ơi`.
- Phần xem trước được chuẩn hóa khoảng trắng và giới hạn độ dài. Ảnh hoặc video chỉ hiển thị mô tả chung, không lộ URL media hay dữ liệu riêng tư.
- Thông báo tin nhắn dùng mức ưu tiên thông thường, tránh chiếm quyền hiển thị khẩn cấp của cuộc gọi.

## Cuộc gọi đến Android khi ứng dụng không ở màn hình trước

- Android đăng ký thêm token FCM native song song với token Expo hiện có. Token được phân loại theo kênh gửi; token iOS và luồng thông báo cũ vẫn được giữ nguyên.
- Lời mời gọi 1:1 còn đang đổ chuông được gửi trực tiếp qua FCM HTTP v1 với ưu tiên cao và thời gian sống ngắn. Màn hình native tạo kênh `calls`, thông báo `CallStyle`, full-screen intent và `ConnectionService` để hiện **Nghe/Từ chối**.
- Chạm **Nghe** hoặc **Từ chối** chỉ mở ứng dụng bằng deep link có `callId`; sau khi phiên đăng nhập sẵn sàng, ứng dụng truy vấn lại trạng thái lời mời và mới gọi API accept/decline. Payload FCM không chứa SDP, ICE, TURN, bearer/session token hoặc thông tin xác thực Firebase.

## Kiểm tra trước khi sử dụng

- Đã chạy kiểm thử nguồn cho payload, quyền riêng tư, token FCM, plugin Android và các hồi quy hiện có. APK này cần được cài trên Android thật để nghiệm thu cả máy khóa/mở khóa, chạy nền và ứng dụng bị hệ thống dừng.
- Android có thể chặn thông báo của ứng dụng **Force stop** cho tới khi người dùng tự mở lại ứng dụng; đây là giới hạn của hệ điều hành, không phải trạng thái có thể khẳng định chỉ bằng kiểm thử nguồn.
- Hãy cho phép thông báo và full-screen notifications của ChatPHT trong cài đặt Android trước khi kiểm thử. Chưa kết luận audio, video hoặc chia sẻ màn hình P2P hoạt động trên thiết bị thật nếu chưa có nghiệm thu hai máy.
