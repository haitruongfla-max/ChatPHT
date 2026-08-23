# Ghi chú nền OTA Expo cho ChatPHT

Ngày rà soát: 23-08-2026 (GMT+7).

## Kết luận kỹ thuật

`expo-updates` là thành phần native của binary. Một APK chỉ nhận được OTA khi đã được build với thư viện này, `updates.url` trỏ đến dịch vụ cập nhật và `runtimeVersion` phù hợp. Vì vậy, chỉ sửa cấu hình nguồn không thể bổ sung khả năng OTA cho APK cũ đã cài.

`runtimeVersion` là ranh giới tương thích giữa JavaScript bundle và mã native được đóng gói. Khi có thay đổi native (ví dụ thêm/cập nhật thư viện native, Expo SDK, cấu hình native), cần tạo APK mới trước khi phát hành update có phụ thuộc thay đổi đó. Runtime policy `fingerprint` giảm nguy cơ nhầm lẫn bằng cách tính runtime từ thay đổi có thể tác động native.

EAS Update hỗ trợ rollback về update đã phát hành hoặc về bundle nhúng trong APK. Rollback dịch vụ là thao tác phát hành riêng; không nên mô tả như cơ chế bảo đảm tự đảo mọi lỗi chạy ứng dụng.

## Nguồn chính thức

1. Expo, “Expo Updates”: https://docs.expo.dev/versions/latest/sdk/updates/
2. Expo, “Runtime versions and updates”: https://docs.expo.dev/eas-update/runtime-versions/
3. Expo, “Rollbacks”: https://docs.expo.dev/eas-update/rollbacks/
4. Expo, “Run EAS Build locally with local flag”: https://docs.expo.dev/build-reference/local-builds/
