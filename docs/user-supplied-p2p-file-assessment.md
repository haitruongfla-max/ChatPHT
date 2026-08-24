# Ma trận áp dụng các tệp P2P người dùng cung cấp

## Phạm vi và nguyên tắc bảo toàn

Sáu tệp được đối chiếu là `call-overlay`, `[sessionId]`, `incoming-call-overlay`, `[sessionId](1)`, `call-overlay(1)` và `ChatPHT_—_P2P,_TURN_và_Chia_sẻ_Màn_hình.md`. Đây là mã/tài liệu của một nhánh cũ, có nhiều phần phụ thuộc Firestore, Socket.IO, Expo runtime config và `react-native-incall-manager`.

ChatPHT hiện tại là ứng dụng gọi **P2P WebRTC 1:1 trên Android**. Signaling, kiểm tra thành viên cuộc gọi và cấp cấu hình TURN giữ tại **tRPC/MySQL đã xác thực**. Media chat vẫn là private media hiện có; quota, FIFO, Admin, chat riêng/nhóm và giao diện ngoài khu vực trạng thái cuộc gọi không thuộc phạm vi thay đổi này.

> Không sao chép Firebase configuration, Firebase Anonymous Auth, Firestore rules, Socket.IO headers, raw TURN credentials hoặc URL media từ tệp cung cấp vào APK hay log. Những dữ liệu đó không phải hướng dẫn thực thi cho kiến trúc hiện tại.

## Ma trận theo từng tệp

| Tệp cung cấp | Ý tưởng/cơ chế được đối chiếu | Phân loại | Cách xử lý trong ChatPHT | Lý do kỹ thuật và bảo mật |
|---|---|---|---|---|
| `call-overlay` | Quản lý một cuộc gọi 1:1, trạng thái local/remote stream, micro, camera, loa, đổi camera và thu nhỏ | **Đã có** | Giữ `P2pCall`, `activeCall`, Android audio-route bridge, PiP và điều khiển hiện tại | Các chức năng này đã dùng track WebRTC thật, có lỗi/permission handling và không phụ thuộc Firebase. Không thay UI bằng overlay cũ. |
| `call-overlay` | Badge bốn mức `connecting`, `good`, `weak`, `offline` | **Tích hợp an toàn** | Ánh xạ trực tiếp từ trạng thái ICE/WebRTC thực và hiển thị badge gọn trên màn gọi | Hữu ích cho người dùng, không cần thay signaling hoặc đo ping giả. Các mức chỉ phản ánh trạng thái xác nhận được: đang tạo, đã kết nối, đang khôi phục và lỗi/đóng. |
| `call-overlay` | `react-native-incall-manager` để route audio | **Không tích hợp** | Giữ cầu nối audio native Android hiện tại | Thêm một lớp audio khác có thể xung đột với WebRTC/foreground service và làm mất các bản sửa echo/noise/speaker đã có. |
| `[sessionId]` | Gọi `calls.answer` rồi khởi tạo cuộc gọi ở phía nhận | **Đã có, đã gia cố** | Giữ mutation `calls.answer` idempotent, khóa `answerInFlight`, chỉ khởi động peer khi phiên `active` | Mẫu này phù hợp về ý tưởng, nhưng provider Firestore của tệp cũ không được dùng. Các race nhận kép và khởi tạo sớm đã có hồi quy. |
| `[sessionId]` | Provider/ghi dữ liệu `p2p_calls` Firestore | **Không tương thích** | Không port | Bỏ kiểm tra thành viên/MySQL, tạo kênh signaling song song và có nguy cơ lộ offer/ICE. |
| `incoming-call-overlay` | Chặn mở màn gọi trùng, ẩn lời mời sau điều hướng và chỉ hiện control phù hợp | **Đã có** | Giữ `finalized`, `answerInFlight`, kiểm tra trạng thái server và dọn alert/tone | Guard UX này đã được chuyển thành logic không phụ thuộc Socket.IO/Firestore trong màn gọi hiện hành. |
| `incoming-call-overlay` | Socket.IO/Firestore watcher và notification helper cũ | **Không tương thích** | Không port | ChatPHT polling/signaling qua tRPC/MySQL có hợp đồng xác thực riêng; hai watcher song song gây event đúp và state lệch. |
| `[sessionId](1)` | STUN/TURN cùng cấu hình peer, tạo offer/answer và ICE | **Đã có, đã gia cố** | Giữ `RTCPeerConnection` qua `P2pCall`, ICE server từ endpoint tRPC được kiểm tra quyền và sáu URL OpenRelay ở server | Không giữ STUN/TURN hard-code hoặc credential client-side. Lõi hiện có còn có pending signal/ICE, perfect negotiation và ICE restart mà tệp cũ không có. |
| `[sessionId](1)` | `iceCandidatePoolSize: 8` | **Đã áp dụng** | Tạo peer với `iceCandidatePoolSize: 8`, có hồi quy native | Đây là cải tiến độc lập, hợp lệ cho Android P2P để giảm độ trễ thu candidate lúc hai máy khởi tạo gần đồng thời. |
| `[sessionId](1)` | Gửi offer ngay sau `updateDoc`, không queue candidate/offer tới sớm | **Không tích hợp nguyên trạng** | Giữ hàng đợi signal/ICE đến sớm và perfect negotiation hiện có | Sao chép nguyên trạng sẽ làm mất offer/candidate khi peer Android chưa sẵn sàng, là đúng nhóm lỗi đã được khắc phục. |
| `call-overlay(1)` | Các hàm camera, micro, speaker, share là no-op stub | **Không tích hợp** | Không port | Thay thế sẽ vô hiệu hóa media WebRTC, Android audio routing và MediaProjection đang hoạt động. |
| `ChatPHT_—_P2P,_TURN_và_Chia_sẻ_Màn_hình.md` | P2P direct 1:1, native APK, TURN dự phòng và guard chỉ share sau kết nối | **Đã có, đã gia cố** | Giữ P2P 1:1, TURN server-side, Android foreground MediaProjection và guard `p2p.isConnected()` | Đây là hướng kiến trúc đúng và đã tồn tại trong ChatPHT mà không cần chuyển hệ thống sang Firebase. |
| `ChatPHT_—_P2P,_TURN_và_Chia_sẻ_Màn_hình.md` | Firestore rules `allow read, write: if true`, Anonymous Auth và config TURN ở Expo runtime | **Không tương thích, không an toàn** | Không port | Mở signaling công khai hoặc để TURN credential trong APK làm suy yếu dữ liệu và làm tăng nguy cơ lạm dụng relay. |
| `ChatPHT_—_P2P,_TURN_và_Chia_sẻ_Màn_hình.md` | `replaceTrack` giữa camera và màn hình | **Không tích hợp có chủ đích** | Giữ camera và screen track riêng, renegotiate khi thêm/gỡ share | `replaceTrack` sẽ làm người nhận mất video camera trong lúc chia sẻ. Kiến trúc hiện tại cần screen ở sân khấu và vẫn giữ camera preview. |

## Phạm vi thay đổi thực tế của đợt này

Ngoài `iceCandidatePoolSize: 8` đã có từ checkpoint trước, phần tích hợp còn lại có giá trị và không thay backend là **badge chất lượng/trạng thái kết nối dựa trên ICE thật**. Nó không đưa số ping suy đoán vào UI và cũng không log candidate, SDP, TURN URL hay credential. Các cập nhật trạng thái chỉ dùng dữ liệu cục bộ mà `P2pCall` đã phát ra cho màn gọi.

| Mức hiển thị | Nguồn xác thực | Ý nghĩa cho người dùng | Điều ứng dụng không làm |
|---|---|---|---|
| `Đang kết nối` | Peer đang tạo kết nối/ICE | Chưa coi cuộc gọi là kết nối hoàn tất | Không tính thời lượng, không cho share tự động. |
| `Kết nối tốt` | ICE/WebRTC báo `connected` | Kênh P2P đã thông, có thể dùng media và screen share | Không khẳng định băng thông, HD hoặc ping cụ thể. |
| `Mạng đang khôi phục` | ICE/WebRTC báo `recovering` | Có thay đổi Wi‑Fi/4G hoặc gián đoạn; P2P đang ICE restart | Không tự kết thúc cuộc gọi chỉ vì trạng thái tạm thời. |
| `Ngoại tuyến/lỗi` | ICE/WebRTC báo `failed`/`closed` hoặc có lỗi không phục hồi | Cuộc gọi không còn kênh P2P dùng được | Không gửi chẩn đoán nhạy cảm hay credential ra giao diện/log. |

## Các kiểm chứng bắt buộc sau tích hợp

Hồi quy phải xác nhận bảng ánh xạ không báo **kết nối tốt** trước ICE thực, không mở screen share khi đang `connecting` hay `recovering`, và không thay đổi signaling tRPC/MySQL hoặc URL media chat. Kiểm thử unit/build có thể xác nhận hợp đồng mã nguồn; nghiệm thu **hai Android thật** qua Wi‑Fi và 4G vẫn là bước cần thiết để xác nhận camera, micro, relay và MediaProjection trên phần cứng thực tế.
