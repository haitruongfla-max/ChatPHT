# Đánh giá gói `ChatPHT_V109_SCREEN_SHARE_LIVEKIT`

**Phạm vi.** Gói người dùng cung cấp là bản lịch sử LiveKit, không phải bản thay thế trực tiếp cho lõi P2P 1:1 hiện tại. Việc đối chiếu chỉ nhằm trích xuất hành vi giao diện hoặc bảo vệ Android có thể dùng lại, tuyệt đối không đưa LiveKit, Socket.IO, token room hoặc cấu hình bí mật vào APK.

> Bản tham chiếu gọi `setScreenShareEnabled` của LiveKit và dựng phiên `share` riêng. ChatPHT hiện tại đã dùng `getDisplayMedia` qua `react-native-webrtc`, MediaProjection foreground service, TURN cấp phía máy chủ và signaling tRPC/MySQL có kiểm tra thành viên.[1] [2]

| Hạng mục trong gói V109 | Kết luận | Lý do và cách xử lý trong ChatPHT hiện tại |
|---|---|---|
| `LiveKitRoom`, token phòng, `setScreenShareEnabled` | **Loại** | Đây là transport/SDK LiveKit; đưa vào sẽ tái lập phụ thuộc đã loại bỏ và thay đổi mô hình P2P 1:1. |
| `socket.io` mời nhận/chấp nhận phiên | **Loại** | Signaling hiện tại phải tiếp tục đi qua tRPC/MySQL, kiểm tra hai người tham gia và hàng đợi ICE kín. |
| Mode call riêng `share` cùng session/room LiveKit | **Loại** | Gây thay đổi lịch sử gọi, session và UX. P2P hiện tại chia sẻ màn hình trong cuộc gọi 1:1 đang hoạt động. |
| Quyền camera/micro/foreground MediaProjection | **Đã vượt** | Cấu hình P2P hiện tại đã khai báo MediaProjection, microphone, camera và service Android 14; phạm vi quyền đầy đủ hơn gói V109.[3] |
| Giữ micro khi bắt đầu chia sẻ | **Đã có** | P2P tạo track màn hình riêng, không thay thế track micro hoặc camera; do đó hai bên tiếp tục nói chuyện. |
| Ưu tiên screen track trên sân khấu với `objectFit="contain"` | **Đã có** | Màn gọi hiện tại đã ưu tiên `remoteScreenStream` và dùng `contain` để không cắt nội dung màn hình.[2] |
| Ẩn preview màn hình ngay trên máy đang chia sẻ để tránh hiệu ứng lặp | **Áp dụng ngay** | Đây là cải tiến có ích. Màn hiện tại có thể render chính stream màn hình cục bộ vào ô nhỏ; sẽ đổi thành camera cục bộ hoặc trạng thái giải thích, tránh phản chiếu vô hạn. |
| Trạng thái/sân khấu rõ ràng khi chỉ chia sẻ trong cuộc gọi thoại | **Áp dụng ngay** | Màn hiện tại chỉ bật sân khấu khi cuộc gọi là video. Sẽ cho sân khấu xuất hiện khi có local/remote screen track, kể cả cuộc gọi thoại, với nhãn trạng thái chính xác. |
| Bubble thu nhỏ LiveKit có preview track | **Không port trực tiếp** | Nó phụ thuộc provider LiveKit; PiP/thu nhỏ P2P hiện hữu được giữ nguyên để không làm hỏng khôi phục cuộc gọi. |
| Web PiP của video phần tử | **Không áp dụng** | Mục tiêu hiện tại là Android native; gói Web không kiểm chứng được `RTCView` P2P và không tạo giá trị thêm. |

## Nâng cấp được thực hiện

Màn P2P xem stream màn hình là một loại sân khấu độc lập với loại cuộc gọi. Khi đối phương chia sẻ, nội dung được hiển thị đầy đủ theo tỉ lệ gốc. Khi chính người dùng chia sẻ, ứng dụng không lặp lại màn hình cục bộ trong preview; thay vào đó vẫn giữ camera cục bộ nếu có, hoặc hiển thị thông báo phát màn hình rõ ràng. Không thay đổi signaling, TURN, quyền, backend, dữ liệu chat hoặc quota.

## Không suy diễn nghiệm thu phần cứng

Việc kiểm tra mã và regression không thể xác nhận MediaProjection, chất lượng video hoặc khôi phục ICE trên hai điện thoại Android thật. Sau khi có APK native mới, vẫn phải thử tối thiểu Wi‑Fi và 4G với hai thiết bị.

## Tài liệu tham chiếu

[1]: ../../review/ChatPHT_V109_SCREEN_SHARE/ChatPHT_V109_SCREEN_SHARE/source/app/call/[sessionId].native.tsx "Màn gọi native LiveKit V109"
[2]: ../app/call.native.tsx "Màn gọi P2P native ChatPHT hiện tại"
[3]: ../app.config.ts "Cấu hình quyền và plugin Android của ChatPHT hiện tại"
