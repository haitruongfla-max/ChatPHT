# Đánh giá kỹ thuật gọi thoại và gọi video cho ChatPHT

## Kết luận ngắn

ChatPHT có thể bổ sung cuộc gọi thoại và gọi video 1-1 qua Internet. Mô hình phù hợp là dùng WebRTC qua LiveKit: ứng dụng Expo kết nối vào phòng cuộc gọi, còn máy chủ ChatPHT cấp mã truy cập ngắn hạn sau khi kiểm tra hai người đúng là thành viên của cùng cuộc hội thoại. LiveKit có SDK và plugin dành cho Expo, nhưng cần bản phát triển/bản cài đặt riêng vì thành phần WebRTC có mã gốc, không chạy trong Expo Go [1].

## Các sự thật kỹ thuật đã xác minh

| Nội dung | Kết quả | Tác động đối với ChatPHT |
|---|---|---|
| Expo và gọi WebRTC | LiveKit cung cấp SDK React Native, plugin Expo và yêu cầu gọi `registerGlobals()`; cần development build vì Expo Go không hỗ trợ mã WebRTC gốc [1]. | Giữ nguyên ứng dụng chat; bổ sung màn gọi và tạo bản cài đặt mới để thử nghiệm trên điện thoại. |
| Hạ tầng kết nối | WebRTC thường cần TURN vì kết nối trực tiếp giữa hai mạng không phải lúc nào cũng thực hiện được [2]. | Không nên chọn giải pháp chỉ P2P nếu yêu cầu cuộc gọi ổn định trên 4G/5G/Wi‑Fi khác mạng. |
| Phương án tự quản lý | LiveKit tự triển khai có TURN tích hợp; môi trường sản xuất cần tên miền, TLS và tài nguyên CPU/băng thông phù hợp [3]. | Phần mềm có thể không mất phí bản quyền, nhưng máy chủ và lưu lượng vẫn có chi phí. |
| Bảo mật quyền vào phòng | Tài liệu LiveKit yêu cầu backend tự tạo JWT, xác thực endpoint và chỉ trả URL máy chủ cùng token truy cập [4]. | Khóa bí mật không được đặt trong điện thoại; backend chỉ cấp token ngắn hạn cho hai thành viên hợp lệ. |
| Mã hóa bổ sung | LiveKit hỗ trợ E2EE cho audio, video và data channel; khóa cần được ứng dụng phân phối qua kênh bảo mật [5]. | Có thể đặt E2EE thành giai đoạn bảo mật nâng cao, không đưa khóa vào log hay thông báo đẩy. |
| Quyền thiết bị | Quyền camera/microphone của Expo cần khai báo từ lúc tạo native build; mô tả quyền iOS cần phù hợp mục đích sử dụng [6]. | Hỏi quyền đúng lúc người dùng bấm gọi hoặc bật camera, đồng thời cần cập nhật cấu hình native. |
| Chi phí dịch vụ quản lý | LiveKit Cloud đo tài nguyên cuộc gọi theo thời gian và lượng dữ liệu truyền [7]. | Không có cước cuộc gọi viễn thông của ChatPHT, nhưng vẫn có dữ liệu Wi‑Fi/di động của người dùng và có thể có phí hạ tầng. |

## Kiến trúc được khuyến nghị

1. Người dùng chạm nút **Gọi thoại** hoặc **Gọi video** trong hội thoại 1-1.
2. Backend kiểm tra người gọi là thành viên hội thoại, tạo mã cuộc gọi ngẫu nhiên và gửi thông báo cuộc gọi đến người nhận.
3. Khi mỗi người tham gia, backend chỉ cấp JWT có thời hạn ngắn cho đúng phòng và đúng danh tính người dùng.
4. Hai thiết bị truyền audio/video qua WebRTC; TURN tự động chuyển tiếp khi hai mạng không thể kết nối trực tiếp.
5. Khi kết thúc, ứng dụng ngắt microphone/camera, đóng kết nối, ghi trạng thái cuộc gọi tối thiểu và không lưu audio/video nếu người dùng chưa chủ động chọn ghi âm/ghi hình.

## Nguồn chính thức

[1]: https://docs.livekit.io/transport/sdk-platforms/expo/
[2]: https://webrtc.org/getting-started/turn-server
[3]: https://docs.livekit.io/transport/self-hosting/deployment/
[4]: https://docs.livekit.io/frontends/build/authentication/endpoint/
[5]: https://docs.livekit.io/transport/encryption/start/
[6]: https://docs.expo.dev/guides/permissions/
[7]: https://docs.livekit.io/deploy/admin/billing/
