# Hợp đồng tái xây dựng P2P 1:1 của ChatPHT

## Phạm vi khóa

Mốc mã nguồn là **ChatPHT 1.0.20 / Android versionCode 24**. Đợt này chỉ được thay thế lớp gọi P2P 1:1. Chat riêng/nhóm, media private, quota 200 GB và FIFO, Admin, xác thực, giao diện ngoài cuộc gọi, notification hiện hữu, MySQL/tRPC và backend Live không thuộc phạm vi sửa đổi.

Tín hiệu SDP/ICE tiếp tục đi qua hàng đợi tRPC/MySQL có xác thực thành viên. TURN chỉ được nhận qua endpoint bảo vệ. Không được thêm Firebase, Socket.IO, LiveKit, phòng nhóm, token phòng hoặc thông tin TURN thô vào ứng dụng.

## Ba phiên bất biến

| `p2pMode` | Nguồn media cục bộ | Bên nhận | API cấm tuyệt đối |
|---|---|---|---|
| `audio` | Chỉ `getUserMedia({ audio, video: false })` | Chỉ nhận audio từ xa | camera, `getDisplayMedia`, MediaProjection |
| `video` | Chỉ `getUserMedia({ audio, video })` | Nhận camera + audio từ xa | `getDisplayMedia`, MediaProjection |
| `screen` | Chỉ người khởi tạo gọi `getDisplayMedia({ video: true, audio: false })` sau khi người nhận chấp nhận | Không mở camera/micro/MediaProjection; chỉ nhận stream màn hình | camera, microphone, nút/nâng cấp sang voice hoặc video |

`p2pMode` là dữ liệu quyết định duy nhất cho phiên media. `kind` chỉ là giá trị lưu tương thích cho lịch sử cuộc gọi và không được dùng để suy ra capture hoặc hiển thị media.

## Điều phối và giao diện

Đợt này duy trì một route `/call` để tránh rủi ro Metro/Expo Router typed-route từng gây treo ở thử nghiệm 1.0.21. Điều kiện bắt buộc là route chỉ đọc `p2pMode` tường minh, sau đó khởi tạo **một** phiên không thể đổi mode. Không được có `startScreenShare`, `stopScreenShare`, `hasScreenShare`, `localScreenStream`, `remoteScreenStream` hay điều khiển chia sẻ màn hình bên trong phiên audio/video.

Màn voice chỉ có điều khiển microphone, loa, thu nhỏ và kết thúc. Màn video chỉ có microphone, loa, camera, đổi camera, SD/HD, thu nhỏ và kết thúc. Màn chia sẻ màn hình chỉ hiển thị trạng thái MediaProjection/stream màn hình, thu nhỏ và kết thúc; người nhận không được yêu cầu quyền capture.

Nút chat, cuộc gọi đến foreground, mở push và bong bóng cuộc gọi phải chuyển tiếp đúng `p2pMode`. Tất cả đường đi đều dùng chung hàm chuẩn hóa mode, không tự suy luận `screen` từ route, `kind` hoặc trạng thái UI.

## Tiêu chí chặn phát hành

Chỉ tạo APK mới sau khi TypeScript, lint, backend build, toàn bộ test, Android export/config và kiểm tra diff sạch đều đạt. Hồi quy phải chứng minh từng lớp phiên không import hoặc khởi tạo media cấm, answer SDP cũ/trùng không được áp dụng lúc peer ổn định, và mọi điểm vào giữ nguyên `p2pMode`.

Sau đó vẫn cần nghiệm thu trên hai thiết bị Android thật—Wi-Fi và 4G—với đúng package **`com.app.swiftchat`**. Chỉ được xác nhận phần cứng hoạt động sau nghiệm thu này.

