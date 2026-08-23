# Ghi chú SDK LiveKit Native — chia sẻ màn hình Android

Ngày rà soát: 23-08-2026.

Phiên bản LiveKit Native đang cài đặt hỗ trợ trực tiếp `LocalParticipant.setScreenShareEnabled(enabled, options?, publishOptions?)` và `createScreenTracks(options?)`; không có API công khai tên `createScreenShareTrack`. Vì vậy lớp gọi của ChatPHT phải dùng `setScreenShareEnabled` để SDK tự thực hiện MediaProjection và publication.

README của SDK nêu rằng từ phiên bản 2.4.0, foreground service cho MediaProjection được SDK quản lý nội bộ. Ứng dụng vẫn phải khai báo quyền `android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION` trong AndroidManifest. Cấu hình Expo hiện đã khai báo quyền này cùng `FOREGROUND_SERVICE`; cần xác nhận manifest sau prebuild trước phát hành.

Khi publication track màn hình bị timeout hoặc người dùng/OEM từ chối MediaProjection, ứng dụng chỉ được unpublish track màn hình dở dang, giữ nguyên phòng LiveKit, camera và micro, rồi báo lỗi có thể hành động. Không thêm `SYSTEM_ALERT_WINDOW` vì không phải quyền thay thế cho MediaProjection.
