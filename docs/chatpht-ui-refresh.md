# Thiết kế làm mới ChatPHT

## Định hướng

Giao diện mới giữ tinh thần nhanh và quen thuộc của một ứng dụng nhắn tin, nhưng sử dụng nhận diện **ChatPHT** riêng thay vì sao chép bất kỳ sản phẩm tham chiếu nào. Bề mặt chính dùng nền aurora sáng dịu gồm xanh lam mờ, tím rất nhạt và các mảng xanh ngọc để thay thế nền trắng phẳng; nội dung quan trọng vẫn nằm trên các thẻ trắng trong, viền mảnh và chữ có độ tương phản cao.

| Thành phần | Quy ước thiết kế |
|---|---|
| Màu thương hiệu | Xanh cobalt `#1A73E8`, xanh đậm `#0B3B8F`, xanh ngọc `#1BB7A8` |
| Nền | Aurora sáng `#EEF7FF` với các lớp tròn mờ tím–xanh ngọc, không dùng ảnh nền tải từ mạng |
| Thanh trên | Khối xanh cobalt, tìm kiếm rõ ràng, nút hành động vuông bo 14 px |
| Danh sách | Ảnh đại diện tròn, tên đậm, mô tả một dòng, thời điểm/đếm chưa đọc ở mép phải |
| Điều hướng dưới | Ba mục: Hộp thư, Trợ lý AI, Tôi; vùng chạm cao tối thiểu 56 px và chừa safe area |
| Cá nhân | Ảnh đại diện lớn, đổi ảnh/đổi tên trong một luồng riêng, các mục cài đặt nhóm theo mục đích |

## Danh sách màn hình và luồng chính

| Màn hình | Nội dung chính | Hành động chính |
|---|---|---|
| Hộp thư | Thanh tìm kiếm, lối vào lời mời kết bạn, danh sách hội thoại | Mở chat, tìm bạn, xem lời mời |
| Danh bạ/tìm bạn | Tìm theo tên người dùng, kết quả và lời mời | Gửi/chấp nhận lời mời, bắt đầu chat |
| Cá nhân | Ảnh đại diện, tên hiển thị, tên người dùng, bảo mật và cài đặt | Mở chỉnh sửa hồ sơ, mở cài đặt, quản trị (nếu có quyền) |
| Chỉnh sửa hồ sơ | Ảnh đại diện dạng tròn, ô tên hiển thị, thông tin tên người dùng cố định | Chọn/chụp ảnh, lưu tên và ảnh |

## Luồng cập nhật hồ sơ

Người dùng mở **Tôi**, chạm **Chỉnh sửa hồ sơ**, sau đó đổi tên hoặc chọn một ảnh vuông. Ảnh được cắt theo tỉ lệ 1:1, tải trực tiếp tới kho lưu trữ bằng URL tạm có giới hạn theo tài khoản, rồi mới được máy chủ gắn vào hồ sơ. Ứng dụng cập nhật phiên cục bộ sau khi máy chủ trả về hồ sơ mới, vì vậy tên và ảnh mới xuất hiện ngay trong tab Cá nhân và các danh sách được làm mới.

Tên người dùng vẫn là mã định danh để tìm bạn và không thay đổi trong luồng này. Tên hiển thị dài từ 2 đến 48 ký tự; ảnh chỉ nhận JPEG, PNG hoặc WebP với dung lượng tối đa 4 MB.
