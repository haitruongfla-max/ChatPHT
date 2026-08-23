# Thiết kế Android 1.0.16: camera, gọi và OTA

## Nguyên tắc bảo toàn

ChatPHT tiếp tục dùng kho media riêng đã có capability URL, kiểm tra thành viên và quota 200 GiB/FIFO. Luồng chụp hoặc quay trong chat chỉ tạo URI cục bộ mới rồi đi qua đúng hàng đợi upload media hiện hữu; không chuyển media sang Firebase Storage vì điều đó sẽ bỏ qua quota, dọn FIFO và lớp bảo vệ truy cập hiện có.

| Hạng mục | Quyết định tương thích |
| --- | --- |
| Chụp/quay trong chat | Nút camera mở action sheet: chụp ảnh, quay video hoặc chọn thư viện. `expo-camera` tạo URI, sau đó tái sử dụng upload queue 3 tác vụ và lưới album hiện có. |
| Nền media | Giữ URL capability riêng tư, thumbnail/video viewer và cache hiện có. Không lưu URL public Firebase. |
| Chia sẻ màn hình | Android khai báo foreground service/media projection. Với 1:1 P2P, người dùng bật chia sẻ thì chuyển có kiểm soát sang LiveKit; mọi lỗi quyền hoặc SDK đều dừng share và giữ cuộc gọi thay vì làm app crash. |
| Xiaomi/MIUI | Không thể tự bật quyền Overlay. App chỉ giải thích rõ, mở App Settings khả dụng và cho phép tiếp tục gọi nếu người dùng từ chối. |
| Video 1:1 | Giữ signaling tRPC/MySQL hiện có thay vì chuyển sang Firestore. Dùng Google STUN; TURN open relay chỉ là fallback thử nghiệm không bảo đảm sản xuất; LiveKit vẫn là fallback ổn định hơn. |
| OTA | `expo-updates` kiểm tra khi mở app và quay foreground, nhưng chỉ fetch/reload khi runtime tương thích. Công tắc từ xa cần dùng backend ChatPHT được xác thực hoặc endpoint công khai tối thiểu, không thêm Firestore riêng. |

## Tiêu chí chống crash

Mọi thao tác camera, MediaProjection, publish screen track, camera/micro track và kiểm tra OTA phải có trạng thái đang xử lý, `try/catch/finally` và khôi phục giao diện. Quyền bị từ chối chỉ hiển thị thông báo hướng dẫn, không kết thúc cuộc gọi hoặc đăng xuất người dùng.

## Nghiệm thu thiết bị

Trước phát hành, cần hai Android thật, trong đó có một Xiaomi: thử ảnh, video, camera trước/sau, gọi video qua Wi-Fi và 4G, bật/tắt mic/camera, thử chia sẻ màn hình/chọn từ chối quyền, và xác minh APK 1.0.16 cập nhật đè bản versionCode 16.

## Tham chiếu

[1] [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)

[2] [LiveKit screen sharing](https://docs.livekit.io/transport/media/screenshare/)

[3] [Expo Updates runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)
