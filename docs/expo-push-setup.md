# Ghi chú cấu hình Expo Push

Thông báo đẩy cần một Expo Project ID được nhúng trong cấu hình ứng dụng để tạo Expo Push Token ổn định. Với Android, bản build phát hành còn cần cấu hình thông tin xác thực FCM trên dự án Expo; đây là yêu cầu của hạ tầng đẩy thông báo, không thể thay thế chỉ bằng mã trong ứng dụng. Thông báo đẩy không hoạt động trong Expo Go Android từ SDK 53; cần development build hoặc release build trên thiết bị vật lý. Người dùng cũng cần cấp quyền thông báo ở cấp hệ điều hành.

Nguồn tham khảo: [Expo Push Notifications Setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [EAS Project ID](https://github.com/expo/fyi/blob/main/eas-project-id.md).
