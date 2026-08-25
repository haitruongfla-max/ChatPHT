# ChatPHT — Bản đồ tái xây dựng P2P 1:1

## Mục tiêu và nguyên tắc an toàn

Đợt tái xây dựng chỉ tác động subsystem gọi P2P 1:1 Android. Chat riêng và nhóm, media private, quota/FIFO, Admin, xác thực, thông báo, MySQL/tRPC ngoài call và UI ngoài call phải giữ nguyên. Mọi signaling vẫn đi qua tRPC/MySQL được xác thực; không thêm Firebase, Socket.IO, LiveKit, signaling public hay credentials TURN trong bundle.

## Bề mặt cần giữ tương thích

| Lớp | Tệp/chủ thể | Hợp đồng không thay đổi |
|---|---|---|
| Phiên cuộc gọi | `server/db.ts` | Chỉ direct 1:1; `p2pMode` bất biến; trạng thái `ringing`/`active`; caller gửi offer, recipient gửi answer. |
| API xác thực | `server/routers.ts` | `calls.start/get/answer/decline/end`, ICE config, hàng đợi `p2pSignal.send/drain` và telemetry tối thiểu. |
| Điểm vào cuộc gọi | `components/incoming-call-watcher.native.tsx`, push handler, chat buttons | Mọi route truyền `callId`, `direction`, `kind` và `p2pMode`; chốt route ngăn mở cùng call hai lần. |
| Điều phối native | `app/call.native.tsx` | Một transport/callId; không bắt đầu media trước khi vai trò và mode hợp lệ; cleanup cục bộ luôn chạy khi kết thúc. |
| Transport | `lib/p2p-call.native.ts` | Serial hóa offer/answer/ICE, xếp ICE trước remote description, chống answer cũ/trùng, ICE restart caller-only, stats best-effort. |
| Media | `lib/p2p-audio-call.ts`, `lib/p2p-video-call.ts`, `lib/p2p-screen-call.ts` | Audio chỉ micro; video camera+micro; screen là MediaProjection riêng theo `p2pMode`. |

## Bằng chứng từ thử nghiệm Android trước tái xây dựng

Telemetry bản 1.0.27 chứng minh thoại và video đã đi đến offer, answer và ICE hai chiều, nhưng phía nhận chuyển `recovering/failed`. Với screen, caller tới media/peer/offer nhưng recipient có offer/ICE mà chưa `media-ready` hoặc answer. Vì vậy signaling server không phải điểm dừng đầu tiên; ưu tiên hiện tại là lifecycle route, khởi tạo media và peer trên thiết bị nhận.

## Trình tự thay thế

1. Tạo một session voice mới, khởi tạo `RTCPeerConnection` đúng một lần, theo flow caller offer → recipient set remote/create answer → caller set remote → ICE hai phía.
2. Chỉ khi voice có telemetry `state-connected` ở hai Android mới dùng cùng transport base để thêm video camera+micro.
3. Chỉ khi video có bằng chứng media thật mới thêm session MediaProjection screen riêng.
4. UI call chỉ được làm mới sau khi từng mode đã có bằng chứng telemetry và media hai chiều; UI không được quyết định hay thay đổi mode.

## Tiêu chí chuyển pha

Voice, video và screen mỗi mode đều cần: TypeScript/lint/build/test/export/config sạch; không có SDP, ICE payload hay TURN credential trong log/telemetry; thử hai Android thật; thông lượng telemetry đến `state-connected`; và media tương ứng hoạt động hai chiều trước khi chuyển sang mode kế tiếp.
