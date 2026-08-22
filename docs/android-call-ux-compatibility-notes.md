# Ghi chú tương thích Android cho nâng cấp gọi

Nghiên cứu ngày 22-08-2026 xác nhận Android hỗ trợ PiP từ API 26 cho video và cuộc gọi video; activity phải khai báo hỗ trợ PiP trong manifest, bảo đảm video tiếp tục khi vào PiP và điều chỉnh giao diện khi đổi chế độ.[1]

Thư viện cộng đồng `expo-pip` cung cấp API PiP Android, có plugin cấu hình và không chạy trong Expo Go; vì vậy phải dùng development build/bản APK mới khi nghiệm thu PiP.[2]

Tài liệu `expo-video` xác nhận plugin cấu hình hỗ trợ thuộc tính cần cấu hình trước khi build, nhưng ChatPHT đang hiển thị video gọi bằng LiveKit thay vì `expo-video`; không được thay thế LiveKit chỉ để lấy PiP.[3]

Android cho phép mở màn hình danh sách tối ưu pin, còn yêu cầu miễn trừ trực tiếp cần quyền `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; Android khuyến cáo phần lớn ứng dụng không dùng luồng yêu cầu trực tiếp này. Tài liệu Doze nêu rõ FCM ưu tiên cao là phương án phù hợp cho thông báo có thể thấy ngay, và chính sách Google Play chỉ cho phép yêu cầu miễn trừ trực tiếp khi chức năng lõi thực sự bị ảnh hưởng.[4] [5]

Do Xiaomi/Oppo kiểm soát Auto-start bằng các màn hình cài đặt riêng của hãng, luồng sản phẩm sẽ mở cài đặt pin chuẩn khi có thể, cung cấp hướng dẫn theo hãng và có phương án dự phòng. Không được hứa hẹn ứng dụng có thể tự gạt bật Auto-start của hệ điều hành.

`expo-intent-launcher` có thể mở Android intent/cài đặt và chỉ hoàn tất khi người dùng trở lại ứng dụng; `expo-device` cung cấp `brand` và `manufacturer` để chọn hướng dẫn Xiaomi/Oppo trên giao diện. Hai API này phù hợp để hỗ trợ người dùng mở cài đặt, không cho ứng dụng quyền tự thay đổi thiết lập hệ thống.[6] [7]

`expo-pip` là Expo native module dành cho Android, không chạy trong Expo Go và yêu cầu development build/APK mới. API công khai gồm kiểm tra khả dụng, cấu hình kích thước/tự vào PiP và gọi vào PiP; vì PiP thu nhỏ cả Android Activity nên cần nghiệm thu trực tiếp với video LiveKit trên Android thật.[8]

## Nguồn cần đọc đầy đủ

1. https://developer.android.com/develop/ui/views/picture-in-picture
2. https://github.com/EdgarJMesquita/expo-pip
3. https://docs.expo.dev/versions/latest/sdk/video/
4. https://developer.android.com/reference/android/provider/Settings#ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
5. https://developer.android.com/training/monitoring-device-state/doze-standby
6. https://docs.expo.dev/versions/latest/sdk/intent-launcher/
7. https://docs.expo.dev/versions/latest/sdk/device/
8. https://github.com/EdgarJMesquita/expo-pip
