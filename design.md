# Thiết kế giao diện SwiftChat

## Mục tiêu trải nghiệm

SwiftChat là ứng dụng nhắn tin đa phương tiện ưu tiên **tốc độ, sự riêng tư và thao tác bằng một tay** trên màn hình dọc 9:16. Giao diện tuân theo nguyên tắc iOS: hệ phân cấp rõ ràng, vùng chạm tối thiểu 44 pt, phản hồi trực quan khi gửi tin và khoảng an toàn phù hợp với tai thỏ, thanh điều hướng và bàn phím ảo.

## Danh sách màn hình

| Màn hình | Nội dung chính | Chức năng |
| --- | --- | --- |
| Chào mừng | Nhận diện SwiftChat, mô tả ngắn về riêng tư và tốc độ | Chuyển sang đăng nhập hoặc tạo tài khoản |
| Đăng ký | Tên hiển thị, tên người dùng duy nhất, mật khẩu | Tạo tài khoản không cần Google/Gmail; kiểm tra tên người dùng và lưu phiên an toàn |
| Đăng nhập | Tên người dùng và mật khẩu | Đăng nhập nhanh, thông báo lỗi không tiết lộ dữ liệu nhạy cảm |
| Hộp thư | Danh sách cuộc hội thoại, trạng thái đọc, thời gian tin gần nhất | Mở trò chuyện, làm mới danh sách, tìm bạn |
| Tìm bạn | Ô tìm theo tên người dùng, kết quả phù hợp | Gửi lời mời kết bạn hoặc mở hội thoại với bạn đã kết nối |
| Lời mời | Danh sách lời mời nhận/gửi | Chấp nhận hoặc từ chối; sau khi kết nối mới mở quyền chat |
| Hội thoại | Tin văn bản, ảnh, video; thanh soạn thảo | Gửi tin, chọn ảnh/video, xem ảnh toàn màn hình, phát video trong app, tự cuộn đến tin mới |
| Hồ sơ & riêng tư | Tên hiển thị, tên người dùng, trạng thái bảo mật, đăng xuất | Quản lý hồ sơ và kết thúc phiên trên thiết bị |

## Luồng người dùng trọng tâm

| Luồng | Các bước |
| --- | --- |
| Tạo tài khoản | Chào mừng → Đăng ký → nhập tên hiển thị, tên người dùng, mật khẩu → xác thực thành công → Hộp thư |
| Tìm và kết bạn | Hộp thư → Tìm bạn → nhập tên người dùng → chọn người dùng → gửi lời mời → người nhận chấp nhận → Hội thoại |
| Nhắn tin nhanh | Hộp thư → chọn hội thoại → nhập nội dung → Gửi → tin xuất hiện tức thời, đồng bộ từ máy chủ |
| Gửi ảnh/video | Hội thoại → nút đính kèm → chọn ảnh hoặc video → kiểm tra loại/kích thước → tải lên riêng tư → gửi tin kèm nội dung đa phương tiện |
| Nhận tin mới | Hội thoại đang mở → tự động làm mới định kỳ nhẹ → tin mới xuất hiện và danh sách cuộn đúng vị trí |

## Thiết kế bố cục chat và bàn phím

Màn hình hội thoại dùng `KeyboardAvoidingView` và vùng an toàn đáy của thiết bị. Thanh soạn thảo được đặt **trên bàn phím** khi người dùng nhập, đồng thời chừa khoảng đệm theo `safeAreaInsets.bottom` khi bàn phím đóng. Danh sách tin nhắn là `FlatList` đảo chiều để đạt hiệu năng tốt, không bị che dưới thanh điều hướng hay phím cảm ứng Android. Nút gửi và đính kèm đặt ở đáy thanh soạn thảo, kích thước chạm tối thiểu 44×44 pt.

## Màu sắc thương hiệu

| Vai trò | Màu | Lý do |
| --- | --- | --- |
| Nền chính | `#F6F8FC` | Trung tính, giảm mỏi mắt khi đọc hội thoại dài |
| Bề mặt | `#FFFFFF` | Phân lớp rõ với nền |
| Xanh Swift | `#2563EB` | Nút hành động và bong bóng tin gửi; cảm giác nhanh, tin cậy |
| Xanh đậm | `#172554` | Tiêu đề và điểm nhấn thương hiệu |
| Bong bóng tin nhận | `#E9EEF8` | Dễ phân biệt với tin gửi, tương phản dịu |
| Thành công | `#16A34A` | Trạng thái đã gửi/kết nối thành công |
| Cảnh báo/lỗi | `#DC2626` | Lỗi xác thực và thao tác không hợp lệ |

## Mô hình dữ liệu và riêng tư

Hệ thống cần các thực thể `Profile`, `FriendRequest`, `Conversation`, `ConversationMember`, `Message` và `MediaAttachment`. Mật khẩu không lưu ở dạng rõ; máy chủ chỉ giữ giá trị băm có muối. Mọi API kiểm tra người dùng đang đăng nhập là thành viên của hội thoại trước khi đọc, tạo hoặc tải nội dung; tệp đa phương tiện chỉ được phát hành URL tạm thời sau khi kiểm tra quyền. Token phiên ở thiết bị được lưu bằng kho bảo mật hệ điều hành.

## Giới hạn phiên bản đầu

Phiên bản đầu tập trung chat 1–1, ảnh và video; chưa bao gồm gọi thoại/video, nhóm, mã hóa đầu-cuối độc lập hay thông báo đẩy. Các tính năng đó cần thiết kế bảo mật và hạ tầng bổ sung ở giai đoạn sau.

## Nâng cấp media và quản lý hội thoại

Chạm vào ảnh hoặc video trong bong bóng tin nhắn sẽ mở một **modal toàn màn hình** trên nền tối. Ảnh được hiển thị theo tỷ lệ nguyên bản bằng chế độ `contain`; video phát với điều khiển hệ thống, có nút mở toàn màn hình riêng của trình phát. Thanh điều khiển nổi có nút đóng ở góc trên trái và nút lưu ở góc trên phải; các nút luôn nằm trong vùng an toàn màn hình.

Khi lưu, ứng dụng chỉ xin quyền thư viện tại thời điểm người dùng chủ động bấm nút. Tệp được tải từ URL có chữ ký vào cache tạm thời, rồi lưu vào thư viện ảnh/video của điện thoại. Web hiển thị thông báo rằng việc lưu trực tiếp dành cho ứng dụng điện thoại.

Xóa hội thoại là thao tác **theo từng tài khoản**: hội thoại biến khỏi hộp thư của người thực hiện nhưng không xóa tin nhắn hay ảnh/video của người còn lại. Gửi một tin nhắn mới hoặc chủ động mở lại từ danh bạ sẽ làm hội thoại xuất hiện trở lại cho người dùng đó. Thu hồi là thao tác **toàn cuộc hội thoại**, chỉ người gửi tin được thu hồi; nội dung và tham chiếu tệp bị gỡ khỏi bản ghi, thay bằng thông báo thu hồi cho cả hai thành viên.
