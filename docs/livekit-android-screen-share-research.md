# Ghi nhận kỹ thuật: chia sẻ màn hình Android qua LiveKit

Ngày rà soát: 23-08-2026 (GMT+7).

## Kết luận áp dụng cho ChatPHT

Chia sẻ màn hình Android trong SDK LiveKit không nên triển khai bằng `getDisplayMedia()` như trình duyệt. Tài liệu LiveKit yêu cầu lấy quyền ghi hình qua `MediaProjectionManager`, sau đó chuyển dữ liệu kết quả sang API bật screen share của participant cục bộ. Track màn hình được publish như một video track trong chính room LiveKit; micro vẫn có thể tiếp tục publish độc lập.

SDK React Native của LiveKit cũng yêu cầu khai báo `android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION`. Từ v2.4.0, foreground service được SDK quản lý nội bộ, nhưng ứng dụng vẫn phải tự khai báo permission trong Android manifest. Cần xác minh đúng API JS đang có trong phiên bản dependency của ChatPHT trước khi tích hợp.

| Nội dung | Quyết định thiết kế |
|---|---|
| Gọi 1:1 P2P | Không thể chia sẻ màn hình qua room LiveKit nếu cuộc gọi vẫn P2P; khi người dùng bật chia sẻ, ứng dụng cần chuyển có kiểm soát sang LiveKit, hoặc báo rõ hạn chế. |
| Gọi nhóm | Dùng room LiveKit sẵn có, publish track màn hình tại đây. |
| Android | Bắt buộc popup cấp quyền MediaProjection của hệ điều hành và foreground service permission. |
| iOS | Không nằm trong phạm vi build APK hiện tại; cần Broadcast Extension riêng nếu bổ sung sau. |
| Chi phí | Không thể cam kết LiveKit “miễn phí vĩnh viễn”; track chia sẻ màn hình vẫn tiêu thụ băng thông/phút SFU theo hạ tầng đang dùng. |

## Nguồn

[1] [LiveKit, Screen sharing](https://docs.livekit.io/transport/media/screenshare/)

[2] [LiveKit, React Native client SDK](https://github.com/livekit/client-sdk-react-native)

[3] [LiveKit, React Native quickstart](https://docs.livekit.io/transport/sdk-platforms/react-native/)
