# ChatPHT 1.0.44 — Startup & Login Recovery

## Khắc phục khởi động và đăng nhập

- Hợp nhất trạng thái xác thực: chỉ một provider đọc phiên cục bộ khi mở app, loại bỏ lượt đọc song song trên màn hình đăng nhập có thể gây chuyển màn hình chồng chéo hoặc giao diện thiếu mượt.
- Chặn gửi đăng nhập/tạo tài khoản đồng thời; một lần chạm chỉ tạo một yêu cầu, đồng thời báo rõ khi thiếu thông tin.
- Gia cố đọc dữ liệu phiên và khóa cục bộ: lỗi SecureStore hoặc dữ liệu cũ không hợp lệ không được phép làm hỏng quá trình mở ứng dụng.
- Thêm màn hình khôi phục an toàn cho lỗi render JavaScript thay vì để người dùng chỉ thấy ứng dụng bị thoát.

## Giảm quá tải máy chủ

- Bảo toàn các chốt giảm polling/retry ở bản trước, không nhân đôi yêu cầu khi máy chủ tạm trả HTTP 429 hoặc nội dung HTML.
- Ngày phát hành, backend công khai phản hồi `200` với kiểm tra sức khỏe và tRPC tối thiểu. Nếu 429 vẫn lặp lại ở một tài khoản, cần log Android để phân biệt lưu lượng thực tế với giới hạn hạ tầng.

## Lưu ý nghiệm thu

- Bản này đã qua kiểm thử nguồn. Cần cài đè và thử mở app, đăng nhập, mở chat và gửi text trên Android thật trước khi kết luận lỗi buộc đóng đã hết.
- Chưa khẳng định audio, video hoặc chia sẻ màn hình P2P hoạt động trên thiết bị thật nếu chưa có nghiệm thu hai máy. Trường hợp ứng dụng bị hệ điều hành tắt hẳn vẫn cần push/native-call riêng để báo cuộc gọi đến.
