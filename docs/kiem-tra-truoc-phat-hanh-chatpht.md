# Báo cáo rà soát trước phát hành ChatPHT

## Phạm vi và nguyên tắc

Đợt rà soát này bảo toàn toàn bộ luồng đang hoạt động của ChatPHT. Mọi chỉnh sửa chỉ xử lý lỗi đã tái hiện hoặc cảnh báo công cụ đã xác minh; không có chức năng chat, media, danh bạ, AI, PIN, gọi hoặc quản trị nào bị loại bỏ.

> Không thể tuyên bố một ứng dụng di động là không còn bất kỳ lỗi nào trước khi kiểm chứng trên thiết bị thật, mạng thật và dịch vụ push thật. Danh sách dưới đây phân biệt rõ phần đã được xác minh tự động và phần cần nghiệm thu trước khi phát hành chính thức.

## Kết quả xác minh tự động

| Hạng mục | Kết quả | Ghi chú |
|---|---:|---|
| Kiểm tra Expo SDK | Đạt | `expo-doctor`: 18/18 kiểm tra đạt, không còn cảnh báo dependency hoặc cấu hình. |
| Kiểm tra kiểu TypeScript | Đạt | Không có lỗi kiểu sau khi căn chỉnh dependency và cấu hình. |
| Lint | Đạt | Không phát hiện vi phạm lint trong mã ứng dụng. |
| Hồi quy tự động | Đạt | 50/50 kiểm thử đạt; 2 kiểm thử credential bên ngoài được bỏ qua mặc định để không yêu cầu secret trong hồi quy nội bộ. |
| Bundle Android | Đạt | `expo export --platform android` hoàn tất; bundle Hermes Android và 26 tài nguyên được tạo thành công. |
| Preview Metro | Đạt | Metro duy trì trên cổng 8081 và phản hồi HTTP 200 sau khi khắc phục chế độ export tĩnh. |
| Cấu hình Expo/EAS | Đạt | Owner `truongbbbs-team`, slug `chatpht`, EAS project ID `313af748-4c54-4949-8389-71ee2772b17a`. |

## Lỗi đã phát hiện và đã khắc phục

| Mức độ | Vấn đề | Cách xử lý an toàn |
|---|---|---|
| Cao | Metro kết thúc sau khi bundle web, làm giao diện quản lý không tải được preview. | Đổi web preview sang chế độ single-page, khởi động lại dịch vụ và xác nhận cổng 8081 ổn định. |
| Trung bình | Dependency Expo thiếu hoặc lệch chuẩn SDK 54, có thể làm build Android kém ổn định. | Căn chỉnh dependency theo Expo SDK 54, thêm `expo-asset` và plugin liên quan; Expo Doctor sạch cảnh báo. |
| Trung bình | Đổi tài khoản trên cùng máy có thể không đăng ký lại token push cho tài khoản mới. | Xóa bộ nhớ token trong ứng dụng khi `user.id` đổi để token được gán lại đúng tài khoản phía máy chủ. |
| Thấp | React Native Web cảnh báo `pointerEvents` đặt trực tiếp trên component. | Chuyển sang `style.pointerEvents` cho ảnh nền và overlay video, không thay đổi thao tác chạm. |

## Checklist bắt buộc trên thiết bị Android thật

| Luồng cần nghiệm thu | Cách kiểm tra | Kết quả cần đạt |
|---|---|---|
| Cài đặt bản mới | Cài APK build từ checkpoint mới trên ít nhất hai máy Android. | Ứng dụng mở, đăng ký/đăng nhập và không treo ở splash. |
| Quyền hệ thống | Cấp Camera, Microphone, Notifications và Media khi được hỏi. | Từ chối quyền phải hiển thị thông báo có hướng dẫn, không crash. |
| Tin nhắn & media | Gửi/nhận văn bản, ảnh và video giữa hai tài khoản; mở toàn màn hình, lưu media, thu hồi và xóa sạch. | Trạng thái gửi/nhận/đọc và tiến trình tải hoạt động đúng. |
| Danh bạ | Kết bạn, tìm theo tên, mở chat; đổi tài khoản trên cùng điện thoại. | Danh bạ chỉ có bạn đã kết bạn; tài khoản mới nhận đúng push của mình. |
| Push khi đóng ứng dụng | Vuốt đóng ứng dụng nhận và gửi, sau đó gửi tin nhắn và gọi từ máy còn lại. | Android hiển thị thông báo đúng kênh; chạm thông báo mở đúng chat/cuộc gọi. |
| Gọi 1:1 | Kiểm tra thoại và video qua Wi-Fi/4G, bật/tắt micro, đổi camera và thu nhỏ cuộc gọi. | Hai chiều có âm thanh/video, thời lượng bắt đầu sau khi nhận, kết thúc dọn màn hình. |
| PIN & quản trị | Đặt PIN, khóa/mở ứng dụng; đăng nhập tài khoản admin và kiểm tra giới hạn thời hạn. | Dữ liệu riêng tư không lộ trước khi mở khóa; quyền admin không xuất hiện với tài khoản thường. |
| Mạng lỗi | Tắt/bật Internet giữa lúc tải media, nhắn tin và gọi. | Hiển thị lỗi có thể hiểu, không mất dữ liệu hoặc treo giao diện. |

## Điều kiện phát hành

Chỉ phát hành chính thức sau khi toàn bộ checklist thiết bị thật đạt trên ít nhất hai thiết bị Android với hai mạng khác nhau. Đặc biệt cần kiểm tra FCM ở trạng thái ứng dụng bị vuốt đóng, camera/micro WebRTC hai chiều và tải video dung lượng lớn; đây là các năng lực không thể mô phỏng trung thực trong môi trường kiểm tra máy chủ.
