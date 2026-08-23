# Nghiên cứu phụ thuộc vận hành ChatPHT

## Firebase Cloud Messaging

Trang sản phẩm Firebase xác nhận không tính phí cho Cloud Messaging; trang giá Firebase cũng liệt kê FCM là `No-cost`. Điều này chỉ áp dụng cho việc chuyển push, không mặc nhiên áp dụng cho các dịch vụ Firebase khác như lưu trữ, database, số điện thoại hoặc Cloud Functions.

- https://firebase.google.com/products/cloud-messaging
- https://firebase.google.com/pricing

## LiveKit

LiveKit nêu rõ có thể tự vận hành máy chủ mã nguồn mở trên hạ tầng riêng; khi đó đội vận hành tự chịu trách nhiệm máy chủ, mạng, TURN, bảo mật và mở rộng. LiveKit Cloud là dịch vụ quản lý có usage-based pricing, đo theo thời lượng và truyền dữ liệu với các mức tối thiểu theo phiên. Trang giá hiện có gói Build $0/tháng nhưng không phải cam kết chi phí vĩnh viễn hoặc không giới hạn; có hạn mức và chính sách có thể thay đổi.

- https://docs.livekit.io/transport/self-hosting/
- https://docs.livekit.io/deploy/admin/billing/
- https://livekit.com/pricing

## Expo EAS

Expo SDK được phát hành miễn phí và mã nguồn mở theo MIT, nhưng EAS là nền tảng cloud riêng để build, cập nhật và theo dõi ứng dụng. Trang giá hiện ghi Free là $0/tháng với 15 build Android và 15 build iOS theo tháng ở hàng đợi ưu tiên thấp. Sau hạn mức, hoặc khi dùng gói trả phí và vượt credit, có usage-based pricing. Vì hạn mức, giá và điều khoản là do nhà cung cấp quyết định, không được hứa là miễn phí vĩnh viễn.

- https://expo.dev/pricing
- https://docs.expo.dev/billing/plans/
- https://docs.expo.dev/billing/usage-based-pricing/

## Phát hành Google Play

APK phân phối nội bộ có thể được cài thủ công trên Android. Nếu phát hành công khai qua Google Play, Google yêu cầu đăng ký tài khoản Play Console, chấp nhận Developer Distribution Agreement, nộp phí đăng ký và xác minh danh tính; vì vậy đây không phải con đường phát hành hoàn toàn miễn phí. Mức phí/điều kiện có thể thay đổi và cần kiểm tra tại Play Console vào thời điểm xuất bản.

- https://support.google.com/googleplay/android-developer/answer/6112435?hl=en
- https://developer.android.com/distribute/console

## Expo Push và FCM

Mã hiện tại gọi Expo Push Service; Expo chuyển thông báo tới FCM trên Android. Expo ghi nhận không tính phí gửi qua Push Service, còn Firebase cũng ghi Cloud Messaging là no-cost. Tuy nhiên Expo giới hạn 600 thông báo/giây/mỗi project và không có SLA; việc giao đến thiết bị còn tùy FCM, kết nối, quyền thông báo và trạng thái thiết bị. Do đó có thể gọi là miễn phí theo chính sách hiện tại, nhưng không thể cam kết miễn phí hay khả dụng vĩnh viễn.

- https://docs.expo.dev/push-notifications/faq/
- https://docs.expo.dev/push-notifications/sending-notifications/
