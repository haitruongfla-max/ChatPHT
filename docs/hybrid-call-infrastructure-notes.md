# Ghi chú hạ tầng gọi hybrid

## TURN/STUN công khai

Kết quả rà soát ngày 22-08-2026 ghi nhận Open Relay của Metered là dịch vụ TURN công khai, vận hành qua các cổng 80 và 443. Dịch vụ này có hạn mức miễn phí và không nên được coi là hạ tầng cam kết cho sản phẩm có lưu lượng lớn hoặc cuộc gọi cần độ ổn định cao. Mọi thông số ICE/TURN phải được xác thực lại trước khi phát hành, không ghi cứng thông tin nhạy cảm vào ứng dụng.

Nguồn: [Open Relay — Metered](https://www.metered.ca/tools/openrelay/), [Metered STUN/TURN](https://www.metered.ca/stun-turn), [WebRTC TURN overview](https://webrtc.org/getting-started/turn-server).

## Quyết định kỹ thuật

LiveKit vẫn là transport mặc định an toàn và ổn định cho gọi nhóm. Fallback P2P 1:1 chỉ được kích hoạt khi có signaling, xác thực thành viên, timeout năm giây, và kiểm thử thiết bị thật qua nhiều mạng. TURN công khai chỉ là phương án dự phòng thử nghiệm; không hứa hẹn miễn phí hoặc đủ cho 1.000 người dùng đồng thời.
