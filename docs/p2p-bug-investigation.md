# Điều tra lỗi P2P Android — 2026-08-24

## Phát hiện ban đầu

- Phiên gọi 1:1 được tạo với thời hạn `ringing` chỉ **60 giây**. Nếu thao tác nhận hoặc điều hướng trễ hơn, backend đổi trạng thái thành `missed` và trả về thông báo cuộc gọi không còn chờ phản hồi.
- Màn hình gọi đặt trạng thái UI `connected` cho bên gọi ngay khi bắt đầu đổ chuông, trước khi `RTCPeerConnection.connectionState` thực sự là `connected`. Vì vậy giao diện có thể trông như một cuộc gọi đã sẵn sàng dù MediaProjection chưa thể bắt đầu.
- Lõi P2P chỉ cho phép `getDisplayMedia` khi ICE/WebRTC đạt `connectionState === "connected"`; đây là hàng rào an toàn hợp lý, nhưng UI cần tách bạch rõ trạng thái đổ chuông, ICE đang kết nối, ICE đã kết nối và ICE đang phục hồi.
- Danh sách chat được làm mới định kỳ trong khi backend cấp lại capability URL media. URI ảnh thay đổi theo mỗi lần poll, kết hợp hiệu ứng `expo-image` transition có thể khiến ảnh hoặc thumbnail nhấp nháy dù cache object đã có.

## Phạm vi sửa an toàn dự kiến

1. Kéo dài thời gian chờ nhận cuộc gọi và hiển thị lỗi trạng thái có thể hành động.
2. Tách `ringing` khỏi trạng thái WebRTC thực sự kết nối; chỉ mở chia sẻ màn hình khi ICE đã kết nối.
3. Duy trì URL media đang hiển thị theo khóa media ổn định, đồng thời tắt crossfade trên dữ liệu đã tải.
4. Bổ sung kiểm thử đơn vị cho timeout, trạng thái share và tính ổn định URI/cache.
