# Xác minh endpoint backend công khai

Ngày 23-08-2026, endpoint triển khai công khai sau đã được kiểm tra trực tiếp:

`https://swiftchat-lx74vew4.manus.space/api/health`

Endpoint trả về HTTP thành công với payload `{"ok":true, ...}`. Vì vậy URL base bền vững phù hợp cho bản Android là:

`https://swiftchat-lx74vew4.manus.space`

URL này không có dấu gạch chéo ở cuối và phải được đặt vào `EXPO_PUBLIC_API_BASE_URL` khi build APK. Nguồn kiểm chứng: endpoint sức khỏe triển khai công khai, 23-08-2026.
