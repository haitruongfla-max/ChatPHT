# SwiftChat

ChatPHT là ứng dụng nhắn tin 1–1 dành cho điện thoại, do **Phùng Hải Trường** tạo ra, tập trung vào thao tác nhanh, chat văn bản, chia sẻ ảnh/video và kết bạn qua tên người dùng. Ứng dụng chạy ở chế độ màn hình dọc và giữ thanh soạn thảo an toàn phía trên bàn phím ảo.

## Luồng sử dụng

Người dùng tạo tài khoản bằng **tên hiển thị, tên người dùng và mật khẩu**; không cần đăng ký qua Gmail. Sau khi đăng nhập, người dùng tìm bạn bằng tên người dùng, gửi lời mời, rồi bắt đầu cuộc hội thoại riêng tư khi lời mời được chấp nhận.

| Tính năng | Hành vi |
| --- | --- |
| Đăng nhập | Dùng tên người dùng và mật khẩu; phiên native lưu trong kho bảo mật của hệ điều hành. |
| Kết bạn | Tìm kiếm theo tên người dùng; chỉ bạn bè đã chấp nhận mới có thể nhắn tin. |
| Nhắn tin | Hộp thư tự làm mới nhẹ, hội thoại dùng danh sách tối ưu cho lịch sử tin nhắn dài. |
| Ảnh/video | Chọn từ thư viện thiết bị; ảnh tối đa 8 MB, video tối đa 100 MB, tải trực tiếp có phần trăm tiến trình. |
| Cảm xúc | Thả hoặc gỡ sáu cảm xúc emoji trên từng tin nhắn; dữ liệu chỉ hiển thị cho thành viên hội thoại. |
| An toàn bàn phím | Thanh soạn thảo sử dụng vùng an toàn và cơ chế tránh bàn phím trên iOS/Android. |

## Bảo mật trong phiên bản đầu

Mật khẩu được băm có muối trước khi lưu. Máy chủ kiểm tra người dùng là thành viên của hội thoại trước khi đọc tin, gửi tin hay tải nội dung đính kèm. Tên tệp được làm sạch và tệp media chỉ được truy cập qua URL có chữ ký tạm thời sau khi vượt qua kiểm tra quyền.

> ChatPHT đã có thông báo đẩy riêng tư. Ứng dụng chưa triển khai gọi thoại/video, hội thoại nhóm hoặc mã hóa đầu-cuối độc lập; các tính năng này cần một giai đoạn thiết kế bảo mật và hạ tầng bổ sung.

## Kiểm tra chất lượng

Chạy các lệnh sau trong thư mục dự án:

```bash
pnpm check
pnpm test
pnpm lint
```

Các kiểm thử hiện tại bao phủ băm mật khẩu, phiên đăng xuất, quyền thành viên hội thoại, từ chối dữ liệu media không hợp lệ và làm sạch tên tệp trước khi lưu trữ.
