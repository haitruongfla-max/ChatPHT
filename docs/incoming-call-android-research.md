# Nghiên cứu incoming call Android

## Android CallStyle và full-screen UI

Tài liệu Android Developers xác nhận rằng Android 12 trở lên có `Notification.CallStyle` dành cho cuộc gọi đến/đang diễn ra. Một incoming call cần hành động **Nghe** và **Từ chối** thông qua `PendingIntent`; các intent vẫn sử dụng được khi tiến trình tạo chúng không còn chạy. Tài liệu cũng khuyến nghị kết hợp Telecom APIs và CallStyle; API 30 trở xuống cần foreground service để có độ ưu tiên tương đương.

Nguồn: [Android Developers — Create a call style notification for call apps](https://developer.android.com/develop/ui/compose/notifications/call-style), truy cập ngày 27-08-2026.

## Nguyên tắc áp dụng cho ChatPHT

Payload FCM chỉ mang định danh phiên gọi, caller ID, chế độ gọi và thời điểm hết hạn; không mang SDP, ICE hay token. Native receiver phải lấy chi tiết phiên qua endpoint có xác thực trước khi hiện CallStyle/full-screen UI; thao tác Nghe/Từ chối phải được kiểm tra lại ở server.

## Ưu tiên FCM Android

Firebase phân biệt `normal` và `high`. `normal` là mặc định, phù hợp cho nội dung không cần phản hồi tức thời và có thể bị trì hoãn trong Doze. `high` cố gắng giao ngay, có thể đánh thức thiết bị và chỉ nên dùng cho sự kiện nhìn thấy được, nhạy thời gian, dẫn tới tương tác người dùng. Vì vậy ChatPHT dùng `normal` cho tin nhắn mới, còn `high` chỉ dùng cho incoming call còn hiệu lực.

Nguồn: [Firebase Cloud Messaging — Set and manage Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority), truy cập ngày 27-08-2026.
