# ChatPHT — WebRTC P2P 1:1 trên Android

## 1. Phạm vi bản P2P-only

ChatPHT hiện dùng **WebRTC P2P 1:1** cho gọi thoại, gọi video và chia sẻ màn hình Android. Luồng Room, token và fallback LiveKit đã được gỡ khỏi runtime. Gọi nhóm và chia sẻ màn hình nhóm không còn được tạo; chat nhóm vẫn giữ nguyên chức năng nhắn tin và media.

> Signaling không phải là media. Backend tRPC/MySQL chỉ xác thực hai thành viên của cuộc gọi và chuyển offer, answer, ICE candidate; âm thanh, hình ảnh và màn hình đi trực tiếp giữa hai thiết bị khi mạng cho phép.

| Thành phần | Trách nhiệm | Dữ liệu không được truyền qua đây |
|---|---|---|
| `calls.start` / `calls.answer` | Tạo và nhận phiên gọi P2P 1:1 có kiểm tra thành viên | SDP, track media, URL media riêng tư |
| `calls.p2pSignal.send` / `drain` | Chuyển `offer`, `answer`, `ice` đã giới hạn kích thước | Không cho người ngoài cuộc gọi đọc hoặc gửi tín hiệu |
| `calls.p2pIceConfig` / `calls.getTurnCredentials` | Trả STUN và TURN động chỉ sau kiểm tra thành viên | Không trả credential TURN cho người không có quyền |
| `RTCPeerConnection` | Kết nối audio/video/screen track trực tiếp | Không gọi Room hoặc token LiveKit |

## 2. Luồng gọi thoại và video 1:1

1. Người gọi chọn cuộc trò chuyện riêng và bấm gọi thoại hoặc video. Client gọi `calls.start` với `conversationId` và `kind`.
2. Backend chỉ tạo phiên mới nếu đây là hội thoại trực tiếp và người tạo là thành viên. Phiên mới có provider `p2p`.
3. Người nhận bấm nghe; hai phía lấy `calls.p2pIceConfig(callId)` sau khi backend đã kiểm tra quyền.
4. App tạo `RTCPeerConnection`, lấy micro; cuộc gọi video lấy thêm camera. Local track được thêm vào peer connection trước khi offer/answer.
5. Caller tạo offer rồi gửi qua `calls.p2pSignal.send`. Callee đặt remote description, tạo answer rồi gửi lại.
6. ICE candidate được gửi dần qua cùng endpoint và được xếp hàng nếu remote description chưa sẵn sàng.
7. Khi `connectionState` thành `connected`, màn hình hiển thị video remote. Nếu kết nối chuyển `failed`, app yêu cầu ICE restart một lần thay vì tạo room/fallback khác.
8. Kết thúc cuộc gọi luôn đóng track, peer connection, hàng polling signaling và gọi `calls.end` idempotent.

### Perfect negotiation

Hai thiết bị có thể cùng thay đổi track (đổi camera hoặc bắt đầu chia sẻ màn hình). Helper P2P áp dụng **perfect negotiation**: phía được xác định polite sẽ rollback offer đang va chạm; phía impolite bỏ qua offer xung đột. Điều này ngăn lỗi “offer in wrong state”, tạo renegotiation ổn định hơn và không publish camera trước khi signaling sẵn sàng.

## 3. Chia sẻ màn hình Android 1:1

1. Trong cuộc trò chuyện riêng, nút chia sẻ mở **cuộc gọi video P2P 1:1** với cờ `startScreenShare`.
2. Màn hình gọi đợi peer connection đạt trạng thái `connected` trước khi gọi `startScreenShare`. Điều này loại bỏ nguyên nhân lỗi cũ `Got disconnected without signal connected`.
3. Engine WebRTC gọi MediaProjection (`getDisplayMedia`), Android hiển thị hộp thoại hệ thống chọn ghi toàn bộ màn hình.
4. Track màn hình được thêm vào đúng peer connection, tạo renegotiation qua signaling đã kết nối. Track camera vẫn có thể duy trì song song.
5. Khi người dùng dừng trên thanh Android hoặc track `ended`, app gỡ screen sender và renegotiate trở lại camera. Không có màn hình chia sẻ nhóm hoặc standalone Room.

> Người dùng Xiaomi/MIUI vẫn phải chấp nhận hộp thoại MediaProjection của Android. Nếu máy tự dừng chia sẻ khi khóa màn hình hoặc chuyển nền, hãy mở Cài đặt pin của ứng dụng và đặt ChatPHT thành **Không hạn chế**. Đây là chính sách hệ điều hành, không thể tự cấp quyền từ ứng dụng.

## 4. TURN có xác thực động 24 giờ

P2P trực tiếp với STUN Google sẽ không kết nối được trên một số mạng 4G/5G, CGNAT và Wi‑Fi có tường lửa. ChatPHT dùng TURN theo kiểu **Coturn REST API**: backend sinh credential riêng cho thành viên hợp lệ của đúng phiên gọi, có hạn **24 giờ**. Không đưa shared secret vào APK hoặc client.

```dotenv
P2P_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:443?transport=tcp
P2P_TURN_SHARED_SECRET=<coturn-static-auth-secret>
# Chỉ là dự phòng cho máy chủ TURN không hỗ trợ REST API. Không dùng đồng thời như cấu hình chính.
P2P_TURN_USERNAME=<ten-nguoi-dung-turn-tinh>
P2P_TURN_CREDENTIAL=<credential-turn-tinh>
```

Với `P2P_TURN_SHARED_SECRET`, backend tạo username có dạng `${expiryUnix}:user-${userId}:call-${callId}` và credential `Base64(HMAC-SHA1(sharedSecret, username))`. `calls.p2pIceConfig` dùng credential này cho flow gọi thông thường; `calls.getTurnCredentials(callId)` có cùng hàng rào xác thực cho tình huống client cần làm mới ICE config. Credential tĩnh chỉ là fallback có chủ đích khi shared secret không được đặt.

Backend chỉ thêm TURN vào `iceServers` khi URL và cách xác thực hợp lệ. Nếu chưa cấu hình, endpoint vẫn trả STUN Google và `hasTurn: false`; giao diện cần hiển thị đúng trạng thái thay vì khẳng định kết nối được trên mọi mạng. Kiểm thử server chỉ chứng minh shared secret được nạp và HMAC được sinh đúng, **không thay thế** thử relay thực tế qua TCP/UDP/TLS với máy chủ TURN đang chạy.

### Checklist TURN trước khi đưa vào production

- Dùng TURN có xác thực dài hạn hoặc credential ngắn hạn do backend cấp, không dùng relay công khai không kiểm soát.
- Mở UDP 3478, TCP 3478 và TLS/TCP 443; bảo đảm chứng chỉ TLS hợp lệ cho hostname TURN.
- Bật relay IPv4; nếu có điều kiện bổ sung IPv6.
- Không log `P2P_TURN_CREDENTIAL`; thay credential định kỳ.
- Thử gọi 4G ↔ Wi‑Fi, 4G ↔ 4G khác nhà mạng, và Wi‑Fi văn phòng ↔ 4G.

## 5. Tương thích Android 13/14 và các lỗi đã xử lý

Khi bắt đầu `getDisplayMedia`, plugin native của ChatPHT bật `WebRTCModuleOptions.enableMediaProjectionService` trước khi module WebRTC dùng MediaProjection. Manifest tạo service với `foregroundServiceType="mediaProjection|microphone|camera"` và khai báo ba quyền foreground tương ứng. Thư viện WebRTC tạo notification foreground của Android; người dùng phải cho phép **Thông báo** trên Android 13+ để nhận trải nghiệm đầy đủ.

Nút loa của P2P gọi cầu nối Android dùng `setCommunicationDevice` trên Android 12+ để chọn **loa ngoài** hoặc **loa trong**, với fallback hệ thống trên bản Android thấp hơn. Bluetooth/tai nghe vẫn do Android ưu tiên khi người dùng kết nối hoặc chọn từ hệ thống; app không ép một thiết bị Bluetooth cụ thể để tránh giành quyền điều hướng âm thanh của hệ điều hành. Ràng buộc WebRTC yêu cầu echo cancellation, noise suppression và auto gain control, nhưng hiệu quả cuối cùng vẫn phụ thuộc chip audio/ROM.

| Thông báo quan sát | Nguyên nhân cần tránh | Cách xử lý đã đưa vào nguồn |
|---|---|---|
| `publishing rejected as engine not connected within timeout` | Camera bị publish vào Room/engine LiveKit trước khi kết nối | Luồng Room LiveKit đã bị gỡ; camera là local track của P2P và chỉ renegotiate khi signaling sẵn sàng |
| `Got disconnected without signal connected` | Bắt đầu MediaProjection khi chưa có peer connection ổn định | Share được xếp chờ đến `connectionState === connected`, sau đó mới xin MediaProjection và add track |
| `Recording was stopped before any data could be produced` | Nhả nút khi encoder chưa sinh frame hoặc CameraView đang chuyển photo → video | Camera re-arm sang video, khóa stop trong cửa sổ encoder, giữ thời lượng tối thiểu, xác minh file và cho phép thử lại |
| Android 14 dừng MediaProjection ở nền | Service chưa chuyển foreground trước khi xin capture | WebRTC MediaProjection service đã được bật native, manifest có loại service và quyền camera/micro/mediaProjection, notification foreground do WebRTC quản lý |
| Loa trong/loa ngoài không đổi được | WebRTC không còn SDK audio route của LiveKit | Cầu nối Android chọn communication device và trả route về hệ thống khi cuộc gọi kết thúc |

`expo-camera` trên Android sử dụng **CameraX**. Expo không có API runtime an toàn để ép ứng dụng sang Camera2 khi một thiết bị lỗi; vì vậy ChatPHT không tuyên bố có “fallback Camera2” giả. Thay vào đó, camera chat được tách instance khỏi `getUserMedia` của cuộc gọi, giữ debounce quay **300 ms**, đợi encoder/keyframe, kiểm tra tệp MP4 và cho phép retry. Nếu một mẫu máy có lỗi driver CameraX, cần thu log thiết bị để quyết định native Camera2 riêng trong một đợt native khác.

Không có câu lệnh nào có thể đảm bảo 100% mọi máy Android; quyền camera/micro, ROM nhà sản xuất, bộ mã hóa và điều kiện mạng vẫn khác nhau. Các thay đổi trên loại bỏ các điều kiện race phổ biến gây ra lỗi đã ghi nhận và cung cấp luồng retry/cleanup thay vì làm tắt ứng dụng.

### Thiết lập pin theo hãng

| Hãng/ROM | Thao tác người dùng cần xác nhận | Mức tự động của ChatPHT |
|---|---|---|
| Xiaomi / MIUI | Pin: **Không hạn chế**; Bảo mật: bật **Tự khởi chạy** | Thử mở trang pin và auto-start phù hợp |
| Oppo / ColorOS | Pin: Không hạn chế; bật **Auto launch** | Thử mở trang pin và auto-start phù hợp |
| Realme | Pin: Không hạn chế; bật **Auto launch** | Thử mở trang pin và auto-start phù hợp |
| Vivo / FuntouchOS | Pin: Không hạn chế; bật **Background start** | Thử mở trang pin và background-start phù hợp |
| Samsung / One UI | Pin: bỏ ChatPHT khỏi **Sleeping apps**, thêm vào **Never sleeping apps** | Mở cài đặt pin chung; người dùng chọn mục theo ROM |
| Huawei / EMUI | Pin: **App launch** → Quản lý thủ công, bật Auto-launch/Secondary launch/Run in background | Mở cài đặt pin chung; người dùng chọn mục theo ROM |

## 6. Nghiệm thu trước khi build APK

1. Kiểm tra TypeScript, lint, backend build và toàn bộ regression test trên source.
2. Trên hai Android: gọi thoại 1:1, đổi loa trong/loa ngoài, cắm/rút tai nghe hoặc Bluetooth, kết thúc và nhận cuộc gọi liên tiếp.
3. Trên hai Android: gọi video 1:1, bật/tắt camera, đổi camera trước/sau, đặt/nhận ICE candidate đến sớm; xác nhận hai microphone không tạo vọng rõ rệt.
4. Trong cuộc gọi video đã kết nối: bấm chia sẻ, chấp nhận MediaProjection, xác nhận notification foreground, kiểm tra bên kia nhận screen track; dừng từ thanh Android và xác nhận camera quay lại bình thường.
5. Camera chat: chạm chụp, giữ quay ít nhất 2 giây, nhả sớm trong lúc chuyển mode, quay 05:00 auto-stop, preview/chú thích/gửi.
6. Lặp lại các cuộc gọi trên Wi‑Fi và 4G/5G khác nhà mạng. Khi TURN được bổ sung, kiểm tra relay qua UDP, TCP và `turns:443` ở phần 4.
7. Nghiệm thu tối thiểu trên Xiaomi/MIUI, Samsung/One UI và Oppo/ColorOS: quyền thông báo, pin/auto-start, gọi thoại/video, share màn hình, khóa màn hình rồi quay lại, camera chat giữ quay ít nhất 2 giây.

## 7. Quy tắc thay đổi tiếp theo

- Không thêm lại Room, token hoặc fallback LiveKit vào luồng 1:1.
- Không xóa migration/dữ liệu lịch sử `livekit` và `screen_share_sessions` đã có; dữ liệu cũ chỉ được giữ để đọc lịch sử, không còn tạo runtime mới.
- Native plugin/bridge yêu cầu một APK mới; OTA không thể đưa MediaProjection foreground service hoặc audio route bridge vào APK cũ. Chỉ tạo APK sau khi các quality gate mã nguồn đạt và ghi nhận giới hạn nghiệm thu thiết bị thật.
