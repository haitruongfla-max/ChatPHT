# Đánh giá tệp P2P do người dùng cung cấp

## Nguồn và phạm vi

Tệp `ChatPHT_—_P2P,_TURN_và_Chia_sẻ_Màn_hình.md` và `call-overlay` do người dùng cung cấp ngày 24-08-2026 mô tả một biến thể P2P cũ. Chúng dùng Firestore cho offer/answer/ICE và `react-native-incall-manager` để route audio.

## Kết luận đối chiếu ban đầu

| Nội dung trong tệp cung cấp | Tương thích với ChatPHT hiện tại | Cách xử lý an toàn |
|---|---|---|
| Firestore test rules mở hoàn toàn, Anonymous Auth, collection `p2p_calls` | Không tương thích và không an toàn | Không tích hợp. ChatPHT dùng tRPC/MySQL đã xác thực thành viên. |
| Cấu hình TURN từ Expo runtime extra | Không phù hợp với credential theo phiên từ backend | Không tích hợp. Giữ truy vấn ICE/TURN đã bảo vệ qua tRPC. |
| Hàng đợi offer/answer/ICE và chỉ báo trạng thái kết nối thật | Có thể áp dụng về mặt nguyên tắc | Đối chiếu với lõi P2P hiện tại và chỉ port phần không phụ thuộc Firebase. |
| `replaceTrack` khi bắt đầu/dừng chia sẻ màn hình | Có thể là phương án giảm số track và renegotiation | Cần kiểm tra với sender/track hiện tại và thêm hồi quy trước khi áp dụng. |
| `react-native-incall-manager` | Không có trong dependency hiện tại | Không đưa dependency mới chỉ từ tệp cung cấp; giữ Android audio bridge hiện tại. |

## Rủi ro không chấp nhận

Không sao chép credential TURN, Firebase configuration, rules test mode hoặc cơ chế signaling Firestore từ tệp cung cấp. Các nội dung này không phải chỉ dẫn thực thi cho kiến trúc MySQL/tRPC hiện tại.

## Tệp session và overlay

Tệp `[sessionId]` gọi mutation tRPC `calls.answer` rồi kích hoạt một `CallOverlayProvider` Firestore. Phần tRPC có thể phản ánh ý tưởng nhận cuộc gọi bất đồng bộ, nhưng provider vẫn ghi trực tiếp vào `p2p_calls` Firestore và do đó không thể sao chép.

Điểm UX có thể tham khảo là tách badge mạng thành `connecting`, `good`, `weak`, `offline`, đồng thời chỉ cho thao tác chia sẻ khi trạng thái thực sẵn sàng. ChatPHT hiện tại đã có lớp trạng thái ICE thực và bản vá cần giữ nguyên hướng đó, không đưa overlay cũ vào dự án.

Tệp `[sessionId](1)` là trang Web/Firestore cũ, hard-code STUN và OpenRelay, đồng thời phát offer ngay sau khi gọi `updateDoc`. Không có hàng đợi candidate/offer trước khi peer sẵn sàng và không xử lý perfect negotiation; không thể dùng làm nguồn sửa lỗi Android hiện tại. Ý tưởng hợp lệ duy nhất là `iceCandidatePoolSize`, nhưng ChatPHT chỉ được đánh giá áp dụng sau khi kiểm thử tải và không thay đổi mặc định tuỳ tiện.

`incoming-call-overlay` dùng Socket.IO/Firestore cũ, còn ChatPHT hiện tại dùng watcher tRPC/MySQL. Các guard UX đã có ích trong bản hiện hành: ẩn invite trước điều hướng và khóa nút nhận để tránh thao tác kép. Không dùng lại socket, headers hay các notification helpers từ tệp này vì có hợp đồng backend khác.

`call-overlay(1)` chỉ là stub TypeScript: toàn bộ thao tác media, speaker, switching camera và share là no-op. Không chứa logic WebRTC hoặc bản sửa có thể dùng; không tích hợp để tránh vô hiệu hoá lớp P2P thật của ChatPHT.

Tài liệu `ChatPHT — P2P, TURN và Chia sẻ Màn hình` mô tả một nhánh Firestore/Socket.IO cũ và Rules `allow read, write: if true`; không được chép sang ChatPHT vì làm lộ signaling. Điểm phù hợp đã có trong ChatPHT hiện tại: chỉ dùng direct call, TURN server-side và native APK. `iceCandidatePoolSize: 8` đã được thêm vào peer Android cùng hồi quy để thu hẹp race khởi tạo offer/answer/ICE. Không dùng `replaceTrack`: kiến trúc hiện tại cần giữ camera và track màn hình riêng để UI bên nhận hiển thị sân khấu chia sẻ mà không mất video; dùng nó sẽ thay đổi hành vi đang mong muốn. Không dùng Expo runtime extra hay Firebase public config cho TURN credentials.
