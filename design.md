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

## Thông báo đẩy cho tin nhắn mới

SwiftChat sẽ xin quyền nhận thông báo **sau khi người dùng đã đăng nhập**, chỉ trên thiết bị thật iOS/Android. Mỗi thiết bị đăng ký một token riêng với máy chủ; token được gắn với tài khoản đã đăng nhập và có thể được thay thế an toàn khi hệ điều hành làm mới token. Trên Android, ứng dụng tạo kênh “Tin nhắn mới” để người dùng tự điều chỉnh âm thanh và mức ưu tiên trong cài đặt hệ thống.

Khi có tin nhắn mới, máy chủ chỉ gửi thông báo cho **thành viên còn lại** trong hội thoại, không gửi lại cho người vừa gửi. Nội dung tiêu chuẩn là “Bạn có tin nhắn mới trong SwiftChat”; tên người gửi và nội dung tin nhắn không xuất hiện trên màn hình khóa nhằm hạn chế tiết lộ dữ liệu riêng tư. Chạm vào thông báo sẽ mở đúng hội thoại sau khi URL điều hướng được kiểm tra hợp lệ.

## Giới hạn phiên bản đầu

Phiên bản đầu tập trung chat 1–1, ảnh và video; chưa bao gồm gọi thoại/video, nhóm và mã hóa đầu-cuối độc lập. Thông báo đẩy được gửi qua dịch vụ thông báo của Expo và cần một bản dựng phát triển hoặc phát hành cài trên thiết bị thật để kiểm thử đầy đủ.

## Nâng cấp media và quản lý hội thoại

Chạm vào ảnh hoặc video trong bong bóng tin nhắn sẽ mở một **modal toàn màn hình** trên nền tối. Ảnh được hiển thị theo tỷ lệ nguyên bản bằng chế độ `contain`; video phát với điều khiển hệ thống, có nút mở toàn màn hình riêng của trình phát. Thanh điều khiển nổi có nút đóng ở góc trên trái và nút lưu ở góc trên phải; các nút luôn nằm trong vùng an toàn màn hình.

Khi lưu, ứng dụng chỉ xin quyền thư viện tại thời điểm người dùng chủ động bấm nút. Tệp được tải từ URL có chữ ký vào cache tạm thời, rồi lưu vào thư viện ảnh/video của điện thoại. Web hiển thị thông báo rằng việc lưu trực tiếp dành cho ứng dụng điện thoại.

Xóa hội thoại là thao tác **theo từng tài khoản**: hội thoại biến khỏi hộp thư của người thực hiện nhưng không xóa tin nhắn hay ảnh/video của người còn lại. Gửi một tin nhắn mới hoặc chủ động mở lại từ danh bạ sẽ làm hội thoại xuất hiện trở lại cho người dùng đó. Thu hồi là thao tác **toàn cuộc hội thoại**, chỉ người gửi tin được thu hồi; nội dung và tham chiếu tệp bị gỡ khỏi bản ghi, thay bằng thông báo thu hồi cho cả hai thành viên.

## Khóa ứng dụng, thông báo và video dung lượng lớn

Khóa ứng dụng là mã PIN 4–8 chữ số do người dùng đặt trong màn hình **Bạn & riêng tư**. Mã được lưu trong kho bảo mật của hệ điều hành, không được gửi lên máy chủ. Khi bật lại SwiftChat từ trạng thái nền hoặc mở ứng dụng sau khi đã đặt mã, một lớp khóa toàn màn hình che mọi nội dung chat cho đến khi mã chính xác được nhập. Người dùng có thể đổi hoặc tắt mã từ cùng màn hình cài đặt.

Thông báo tin nhắn có công tắc **Hiển thị thông báo**. Khi tắt, ứng dụng hủy đăng ký token trên máy chủ để không nhận push ở thiết bị đó; khi bật, ứng dụng xin quyền hệ thống, đăng ký lại token và tạo kênh Android mức ưu tiên cao. Nội dung push vẫn giữ riêng tư: chỉ ghi “Bạn có tin nhắn mới”.

Video tối đa **100 MB** được tải trực tiếp từ tệp thiết bị đến kho riêng tư qua URL tạm có chữ ký, thay vì mã hóa toàn bộ thành Base64 trong bộ nhớ. Ảnh và video nhỏ giữ nguyên luồng nhanh hiện hữu. Ứng dụng hiển thị rõ dung lượng giới hạn trước khi tải; việc cắt video chuyên sâu không được thêm trong phiên bản này vì Expo không có trình cắt video đa nền tảng tích hợp sẵn mà không cần native module/bản dựng tùy chỉnh.

## Tiến trình tải và xóa sạch nội dung hội thoại

Khi người dùng chọn ảnh hoặc video, thanh soạn thảo chuyển sang trạng thái **Đang tải lên — n%**. Phần trăm được tính từ số byte đã gửi trên tổng số byte cần gửi; một thanh chỉ báo mảnh màu Xanh Swift xuất hiện ngay phía trên thanh soạn thảo, không che danh sách tin nhắn hoặc bàn phím. Trong thời gian tải, nút gửi và nút đính kèm bị vô hiệu hóa để tránh tạo hai lần cùng một yêu cầu; người dùng vẫn có thể đọc hội thoại. Trạng thái bị xóa ngay khi tải hoàn tất hoặc thất bại, đồng thời lỗi hiển thị rõ ràng mà không làm mất văn bản đang soạn.

Mục **Xóa sạch toàn bộ nội dung** là thao tác vĩnh viễn, khác với xóa hội thoại theo từng tài khoản. Sau một hộp thoại xác nhận nêu rõ phạm vi, máy chủ xác minh người yêu cầu là thành viên rồi xóa mọi tin nhắn, mọi bản ghi tệp đính kèm và các tệp ảnh/video tương ứng trong kho riêng tư. Việc này áp dụng đồng thời cho cả hai thành viên; bản ghi hội thoại và quan hệ thành viên được giữ để hai người có thể bắt đầu một luồng trò chuyện trống ngay sau đó. Khi hoàn tất, giao diện làm mới hộp thư và danh sách tin nhắn tức thì.

## Trả lời trực tiếp tin nhắn

Người dùng có thể chạm nút **Trả lời** trên từng tin nhắn chưa bị thu hồi để neo câu trả lời vào đúng ngữ cảnh. Thanh soạn thảo hiện một thẻ trích dẫn gọn gồm tên người gửi và bản xem trước: nội dung văn bản được rút gọn một dòng, ảnh hiển thị nhãn “Ảnh”, còn video hiển thị nhãn “Video”. Nút đóng trên thẻ cho phép hủy thao tác mà không làm mất nội dung đang soạn; việc chọn ảnh/video vẫn được hỗ trợ và tin nhắn media mới cũng giữ tham chiếu trả lời.

Mỗi tin nhắn mới có thể lưu một `replyToMessageId` tùy chọn, chỉ được chấp nhận khi tin nguồn thuộc cùng hội thoại và người gửi là thành viên. Tin hiển thị thẻ trích dẫn phía trên bong bóng; chạm vào thẻ sẽ cuộn đến tin nguồn khi còn tồn tại. Nếu tin nguồn đã thu hồi hoặc xóa sạch hội thoại, câu trả lời vẫn giữ nguyên nhưng thay bằng nhãn trung tính “Tin nhắn gốc không còn khả dụng”, không tiết lộ nội dung đã bị gỡ.

## Xem media nhanh và tối ưu bộ nhớ

Danh sách hội thoại chỉ hiển thị ảnh bằng bộ nhớ đệm đĩa/bộ nhớ với khóa ổn định, để ảnh đã mở không phải tải lại khi danh sách tự làm mới. Video trong danh sách không được tạo trình phát riêng cho từng bong bóng; thay vào đó hiển thị thẻ xem trước có nút phát tức thì. Chỉ khi người dùng chạm vào video, ứng dụng mới mở một trình phát duy nhất trong modal toàn màn hình, có chỉ báo đệm dữ liệu và cache nội dung theo cơ chế ít dùng trước. Cách này giữ thao tác cuộn, mở ảnh và mở video nhanh ngay cả khi lịch sử có nhiều tệp đính kèm.

Ứng dụng **không tự động xóa** lịch sử sau ba ngày. Lịch sử dài không tự làm hỏng khả năng gửi tin hoặc media; hiệu năng được bảo vệ bởi giới hạn tải tin gần đây, cache có kiểm soát và chỉ khởi tạo media khi cần. Thao tác xóa sạch thủ công vẫn giữ nguyên: người dùng có thể xóa vĩnh viễn toàn bộ nội dung chung khi chủ động xác nhận.

## Hỏi đáp AI riêng tư

ChatPHT có một tab **Hỏi đáp AI** độc lập với hội thoại bạn bè. Chỉ câu hỏi do người dùng nhập trong tab này được gửi đến máy chủ để tạo câu trả lời; ứng dụng không tự chuyển nội dung của bất kỳ hội thoại riêng tư nào cho AI. Màn hình dùng nền chuyển sắc nhẹ, vùng hỏi lớn ở đáy, các thẻ gợi ý ngắn và lịch sử cục bộ trong phiên để thao tác một tay. Máy chủ giới hạn độ dài câu hỏi, chỉ dùng mô hình tích hợp phía máy chủ và trả về văn bản thuần, giúp không đưa khóa truy cập hay nội dung chat cá nhân ra ứng dụng khách.
