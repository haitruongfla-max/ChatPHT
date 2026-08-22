# Hướng dẫn cấu hình Firebase Cloud Messaging cho ChatPHT trên Android

Tài liệu này hướng dẫn cấu hình **Firebase Cloud Messaging (FCM) V1** để ChatPHT nhận thông báo tin nhắn và cuộc gọi khi ứng dụng không mở ở màn hình. Hướng dẫn áp dụng cho bản Android hiện tại của ChatPHT có **application ID** là `com.app.swiftchat`, phiên bản **1.0.1 / versionCode 2**.

> **Phân biệt quan trọng:** “vuốt đóng ứng dụng khỏi danh sách đa nhiệm” khác với chọn **Buộc dừng / Force stop** trong Cài đặt Android. FCM được dùng để báo khi ứng dụng đã bị vuốt đóng; không dùng trạng thái *Buộc dừng* làm tiêu chí nghiệm thu, vì Android chặn ứng dụng đang ở trạng thái đó cho tới khi người dùng tự mở lại ứng dụng. [4]

| Thành phần | Mục đích | Cách bảo quản |
|---|---|---|
| `google-services.json` | Gắn **APK ChatPHT** với dự án Firebase để máy Android đăng ký FCM. | Có thể để trong mã nguồn riêng tư của dự án; không chứa private key. |
| Khóa Service Account dạng JSON | Cho phép **Expo Push Service** gửi FCM V1 đến thiết bị Android. | Bí mật tuyệt đối; không gửi trong chat, không commit Git, chỉ tải lên mục Credentials của Expo. |
| `ExpoPushToken[...]` | Địa chỉ nhận push của một lần cài đặt ChatPHT. | Được ứng dụng gửi về máy chủ sau khi người dùng cấp quyền; thay đổi khi cài lại hoặc token bị xoay. |

## 1. Kiểm tra điều kiện đã có trong ChatPHT

Mã nguồn ChatPHT đã có `expo-notifications`, plugin `expo-notifications`, quyền `POST_NOTIFICATIONS`, các kênh `messages`/`calls`, đăng ký `ExpoPushToken`, và payload ưu tiên cao tương ứng. Tệp `google-services.json` của Firebase project `chatpht-3d01f` đã được xác minh đúng package `com.app.swiftchat`, đặt tại gốc dự án và đã khai báo `android.googleServicesFile`. Vì vậy, **không cần tạo lại luồng đăng ký token trong ứng dụng**. Phần còn lại để FCM V1 có thể gửi thông báo là tạo/kiểm tra Service Account và tải khóa riêng tư lên vùng Credentials an toàn của Expo, sau đó tạo Android build mới.

Trước khi thao tác, hãy chắc chắn dùng một tài khoản Google/Firebase mà bạn quản lý lâu dài. Đừng tạo nhiều dự án Firebase cho cùng một package, vì một APK chỉ nên trỏ đến một cấu hình Firebase nhất quán.

| Thông tin cần điền | Giá trị dành cho ChatPHT |
|---|---|
| Tên Android package | `com.app.swiftchat` |
| Tên hiển thị gợi ý trong Firebase | `ChatPHT Android` |
| Bản Android cần tạo lại sau cấu hình | `1.0.1`, `versionCode 2` hoặc mới hơn |
| Dịch vụ gửi hiện tại | Expo Push Service gửi qua FCM V1 |

## 2. Tạo hoặc mở dự án Firebase

Mở [Firebase Console](https://console.firebase.google.com/), đăng nhập bằng tài khoản Google của bạn, rồi chọn **Add project** nếu chưa có dự án Firebase dành riêng cho ChatPHT. Đặt tên dễ nhận biết, ví dụ `ChatPHT Production`. Google Analytics không bắt buộc để push hoạt động, nhưng Firebase khuyến nghị bật Analytics nếu bạn cần báo cáo phân phối thông báo. [3]

Trong trang tổng quan của dự án Firebase, chọn biểu tượng **Android** để thêm ứng dụng Android. Tại ô **Android package name**, phải nhập **chính xác** `com.app.swiftchat`. Không thêm khoảng trắng, không đổi thành `swiftchat`, và không dùng package của một APK cũ. Nhập tên hiển thị `ChatPHT Android`, sau đó bấm **Register app**.

> Nếu Firebase yêu cầu SHA-1, chỉ nhập dấu vân tay của chứng chỉ thực sự ký bản Android mới. Bạn có thể bổ sung SHA-1 sau. Nếu phát hành qua Google Play và API key bị hạn chế, SHA-1 cần là **App signing key** trong Play Console, không phải upload key. [2]

## 3. Tải và đưa `google-services.json` vào dự án

Sau khi đăng ký Android app, Firebase sẽ cho tải tệp **`google-services.json`**. Tải đúng tệp của app package `com.app.swiftchat`, rồi đặt nguyên tệp tại thư mục gốc dự án ChatPHT với đường dẫn sau:

```text
/home/ubuntu/swift-chat/google-services.json
```

Sau đó bổ sung một dòng vào phần `android` của `app.config.ts`:

```ts
android: {
  // Giữ nguyên toàn bộ cấu hình đang có.
  package: env.androidPackage,
  googleServicesFile: "./google-services.json",
}
```

Tệp này giúp ứng dụng Android đăng ký với FCM. Expo yêu cầu khai báo `expo.android.googleServicesFile` để đưa cấu hình đó vào Android build. [2] Không sửa tay nội dung tệp JSON, không đổi tên package trong Firebase, và không dùng tệp tải từ một Firebase project khác.

## 4. Tạo khóa Service Account cho FCM V1

Trong Firebase Console, vào biểu tượng bánh răng **Project settings** → thẻ **Service accounts**. Chọn **Generate new private key** rồi xác nhận **Generate key**. Trình duyệt sẽ tải một tệp JSON chứa private key.

Khóa này khác với `google-services.json`: nó cho phép máy chủ gửi thông báo thay mặt dự án Firebase. Hãy lưu tệp ở nơi riêng tư trên máy của bạn, không tải lên kho mã nguồn, không gửi qua ứng dụng chat và không đính kèm vào cuộc trò chuyện này. Expo cũng yêu cầu loại khóa Service Account này khi gửi Android push qua FCM V1. [2]

| Thao tác | Được làm | Không được làm |
|---|---|---|
| Lưu khóa Service Account | Lưu trong thư mục riêng tư, có quyền truy cập hạn chế. | Commit Git hoặc gửi cho người không quản trị. |
| Chia sẻ với Expo | Chỉ upload qua trang Credentials của đúng Expo project. | Đặt vào `assets/`, `app.config.ts` hoặc biến công khai. |
| Xử lý nghi ngờ lộ khóa | Thu hồi khóa trong Google Cloud/Firebase và tạo khóa mới. | Tiếp tục dùng khóa đã lộ. |

## 5. Upload khóa FCM V1 vào Expo

ChatPHT đang gửi thông báo bằng **Expo Push Service**, vì vậy bạn không cần sửa backend để gọi HTTP API FCM trực tiếp. Thay vào đó, phải upload Service Account JSON vào đúng Expo project đang build ChatPHT.

Mở [Expo](https://expo.dev/), chọn dự án **swift-chat** của ChatPHT, vào **Project settings** → **Credentials** → **Android**. Nếu hệ thống yêu cầu, chọn hoặc tạo Application Identifier `com.app.swiftchat`. Trong **Service Credentials**, tìm **FCM V1 service account key**, chọn **Add a service account key**, chọn **Upload new key**, tải lên tệp Service Account JSON ở bước 4 và bấm **Save**. Quy trình này là luồng FCM V1 chính thức mà Expo khuyến nghị. [2]

Nếu sử dụng dòng lệnh trên máy cá nhân thay vì giao diện Expo, có thể chạy `npx eas-cli@latest credentials`, rồi chọn theo thứ tự **Android** → **production** → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account key**. [2]

## 6. Build và cài lại APK Android

FCM không thể được thêm vào APK đã cài sẵn chỉ bằng cách khởi động lại ứng dụng. Sau khi đã có `google-services.json`, khai báo `googleServicesFile`, và FCM V1 key trên Expo, cần tạo **một Android build mới** rồi cài lại lên điện thoại. Remote push Android không hoạt động trong Expo Go từ SDK 53; phải dùng development build hoặc release APK/AAB đã đóng gói native. [1] [3]

ChatPHT đã có `eas.json` với hai profile Android: `apk` dành cho cài trực tiếp và thử FCM nội bộ, `aab` dành cho luồng Google Play. Khi hệ thống Expo hỏi keystore ở lần build Android đầu tiên, chọn **Generate new keystore**; Expo giữ thông tin ký trong Credentials để những build sau nhất quán. Dùng profile `apk` cho hai điện thoại thử nghiệm; AAB không thể cài trực tiếp mà cần đi qua Google Play Internal testing hoặc một kênh phân phối phù hợp. [6]

### Khi cửa sổ điều khiển từ xa bị kẹt

Màn hình đen có vòng tròn tải trong công cụ điều khiển điện thoại từ xa không phải lỗi FCM và cũng không phải trang Expo. Hãy đóng cửa sổ đó, rồi dùng Chrome hoặc trình duyệt thông thường trên điện thoại/máy tính để đăng nhập `expo.dev`. Tại dự án ChatPHT, vào **Project settings → Credentials → Android** và thực hiện tuần tự: tạo keystore mới nếu chưa có, tải Service Account JSON vào đúng mục **FCM V1 service account key**, rồi quay lại giao diện dự án để tạo Android build profile `apk`. Không tải Service Account JSON lên chat, mã nguồn hoặc thư mục `assets/`.

Khi mở ChatPHT lần đầu sau khi cài build mới, chọn **Cho phép** ở hộp thoại thông báo. Trên Android 13 trở lên, khai báo permission trong manifest là chưa đủ; người dùng còn phải cấp quyền `POST_NOTIFICATIONS` khi chạy ứng dụng. [3]

## 7. Kiểm thử theo thứ tự để tìm đúng lỗi

Thử nghiệm nên được thực hiện bằng hai máy Android thật có Google Play services và Internet ổn định. Mở ChatPHT trên máy B, đăng nhập, cấp quyền thông báo, sau đó kiểm tra tại **Cài đặt Android → Ứng dụng → ChatPHT → Thông báo** rằng thông báo tổng và các kênh `messages`/`calls` đều bật, có âm thanh và không bị đặt thành im lặng.

Tiếp theo, đóng ChatPHT ở máy B bằng cách **vuốt khỏi danh sách đa nhiệm**, không bấm **Buộc dừng**. Dùng máy A gửi tin nhắn cho máy B. Thông báo phải hiện trên thanh trạng thái của máy B. Lặp lại bằng một cuộc gọi đến: thông báo cuộc gọi phải xuất hiện, nhưng thông báo gọi cũ không được đến muộn; máy chủ hiện đã đặt thời hạn rất ngắn cho loại payload này. FCM có thể trì hoãn thông báo tùy trạng thái mạng/thiết bị, còn TTL bằng 0 sẽ loại bỏ thông báo không thể giao ngay — phù hợp cho cuộc gọi đến hơn là tin nhắn thông thường. [5]

| Kết quả quan sát | Ý nghĩa có khả năng cao | Hành động tiếp theo |
|---|---|---|
| Có local test nhưng không nhận khi app đã vuốt đóng | Chưa có FCM V1 key, chưa có `google-services.json`, hoặc chưa cài build mới. | Rà lại bước 3–6. |
| Không thấy `ExpoPushToken` sau khi đăng nhập | Chưa cấp quyền thông báo, project ID Expo thiếu, hoặc Firebase registration bị chặn. | Mở app, cấp quyền, kiểm tra log/token và cấu hình API key. |
| Chỉ máy Android 13+ không hiện thông báo | Quyền runtime đã bị từ chối. | Bật lại trong Settings → Apps → ChatPHT → Notifications. |
| Có banner nhưng không có tiếng | Kênh Android bị tắt tiếng từ lần tạo trước. | Bật âm thanh trong cài đặt kênh, hoặc gỡ/cài lại APK để tạo kênh mới. |
| Firebase trả `403 PERMISSION_DENIED` khi đăng ký | API key bị giới hạn sai SHA-1 hoặc chưa cho phép FCM Registration/Firebase Installations API. | Kiểm tra hạn chế API key trong Google Cloud theo bước 8. |

## 8. Xử lý lỗi phổ biến trước khi yêu cầu kiểm tra mã

Nếu máy B không lấy được token và Google Cloud báo `403 PERMISSION_DENIED`, vào [Google Cloud Console – Credentials](https://console.cloud.google.com/apis/credentials). Với API key trong `google-services.json`, hoặc tạm thời để API key không bị giới hạn trong giai đoạn kiểm thử, hoặc cho phép **FCM Registration API** và **Firebase Installations API**. Nếu giới hạn theo ứng dụng Android, dùng SHA-1 đúng theo chữ ký phát hành. [2]

Nếu việc gửi tin nhắn giữa hai máy vẫn không tạo thông báo dù token có mặt, hãy lưu lại thời gian gửi, username hai bên, token Expo (có thể che phần giữa) và ảnh chụp mục Notifications của Android. Các dữ liệu này giúp phân biệt lỗi **đăng ký thiết bị**, **FCM credential**, **Expo ticket**, và **thiết lập kênh của Android** mà không cần lộ private key.

## Checklist trước khi báo “FCM đã hoàn tất”

- [x] Firebase Android app đã được tạo đúng với `com.app.swiftchat` (đã xác minh bằng `google-services.json` của project `chatpht-3d01f`).
- [x] `google-services.json` đúng dự án đã nằm tại gốc ChatPHT và `googleServicesFile` đã được khai báo.
- [ ] Service Account JSON FCM V1 đã upload vào **Expo → Credentials → Android**, không lưu trong Git hoặc chat.
- [x] `eas.json` đã có profile `apk` (cài trực tiếp) và `aab` (Google Play); keystore được tạo trong Expo Credentials ở lần Android build đầu tiên.
- [ ] Đã tạo và cài **APK build mới** lên cả hai máy, không dùng Expo Go.
- [ ] Cả hai máy đã mở ChatPHT, đăng nhập, và cấp quyền thông báo.
- [ ] Máy nhận được thử sau khi **vuốt đóng** ChatPHT, với tin nhắn và cuộc gọi riêng biệt.
- [ ] Đã kiểm tra kênh `messages` và `calls` không bị tắt tiếng trong cài đặt Android.

## Tài liệu tham khảo

[1]: https://docs.expo.dev/push-notifications/push-notifications-setup/ "Expo — Push notifications setup"
[2]: https://docs.expo.dev/push-notifications/fcm-credentials/ "Expo — Obtain Google Service Account Keys using FCM V1"
[3]: https://firebase.google.com/docs/cloud-messaging/android/get-started "Firebase — Get started with Firebase Cloud Messaging in Android apps"
[4]: https://firebase.google.com/support/troubleshooter/fcm/delivery/diagnose/android/received/sent/notification/forcestop-true "Firebase — Android notification message handling on force-stopped app"
[5]: https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan "Firebase — Set the lifespan of a message"
[6]: https://docs.expo.dev/build/eas-json/ "Expo — Configure EAS Build with eas.json"
