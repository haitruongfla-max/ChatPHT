# Bằng chứng video lỗi P2P — 2026-08-25

Nguồn: `/home/ubuntu/upload/Screenrecorder-2026-08-25-10-28-01-714.mp4`, do người dùng cung cấp.

## Quan sát theo thời gian

| Thời điểm | Quan sát |
|---|---|
| 00:02–00:03 | Người dùng chạm **biểu tượng máy quay** trong hội thoại với “Truong”. Video không ghi nhận thao tác nút gọi thoại. |
| 00:03–00:07 | Hiện màn gọi P2P có nhãn “P2P - bảo mật”, “Đang gọi...”, “Đang gửi yêu cầu cuộc gọi đến người nhận”, chỉ báo đang kết nối và nhạc chờ. |
| 00:09–00:22 | Người dùng lặp lại thao tác biểu tượng máy quay; lần thứ ba thấy “Đang chuẩn bị P2P...”, rồi màn gọi chờ tương tự. |

## Điều không xuất hiện

Không xuất hiện hộp thoại hệ thống Android xin quyền MediaProjection, chỉ báo hệ thống quay/chia sẻ màn hình, khung preview màn hình hay tên package/version. Video vì thế không chứng minh `getDisplayMedia` hoặc MediaProjection đã thực thi; nó chứng minh UI video đang bị người dùng nhận diện là giống màn chia sẻ và cuộc gọi chưa thiết lập được.

## Hệ quả kiểm tra

Đợt sửa tiếp theo phải đối chiếu APK thực cài trên máy với commit/release và đặt nhận diện mode dễ thấy ngay trước khi người nhận bắt máy: “Gọi thoại — chỉ micro”, “Gọi video — camera + micro”, hoặc “Chia sẻ màn hình — MediaProjection”. Đồng thời phải chặn mọi khả năng UI screen hiển thị khi route/persisted `p2pMode` là `audio` hoặc `video`.
