# ChatPHT 1.0.42 — Call & Message Reliability

## Sửa lỗi cuộc gọi bị kẹt

- Trạng thái **đã nhận máy** được tách khỏi trạng thái **đã kết nối WebRTC thật**. Server chỉ ghi phiên `active` sau khi `RTCPeerConnection` thực sự connected.
- Heartbeat, timeout và đối soát phiên tự dọn phiên đổ chuông/đã nhận/active không còn sống. Khi người gọi bỏ dở, peer lỗi hoặc không kết nối được, server kết thúc phiên để cuộc gọi kế tiếp không còn bị chặn bởi thông báo “Hội thoại này đang có một cuộc gọi khác”.
- Migration mới chỉ bổ sung trạng thái `accepted` và heartbeat; dữ liệu lịch sử gọi có sẵn vẫn được giữ nguyên.

## Sửa độ tin cậy gửi tin

- Client chỉ parse JSON sau khi kiểm tra nội dung phản hồi; HTML từ proxy hoặc endpoint lỗi được nhận diện và báo rõ thay vì `JSON Parse error: Unexpected character: <`.
- Gửi text thêm `clientRequestId` idempotent và retry đúng một lần với cùng định danh. Nếu backend đã nhận request, tin hiện hữu được trả về thay vì tạo bản ghi trùng.
- Migration message chỉ thêm khóa định danh request; gửi text, media, reply và phân quyền hiện hữu không bị thay đổi.

## Lưu ý kiểm thử

- Bản này đã qua hồi quy nguồn. Audio/video/chia sẻ màn hình vẫn cần nghiệm thu bằng hai Android thật qua Wi‑Fi và 4G.
- Trường hợp ứng dụng bị hệ điều hành tắt hẳn vẫn cần push/native-call riêng để báo cuộc gọi đến.
