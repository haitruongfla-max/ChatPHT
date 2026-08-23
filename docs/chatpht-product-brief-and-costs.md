# ChatPHT: Prompt tổng hợp làm mới ứng dụng và kiểm tra chi phí vận hành

**Tác giả:** Manus AI  
**Phiên bản tham chiếu:** checkpoint `1f66b12d`  
**Mục đích:** Tạo một yêu cầu triển khai thống nhất để tiếp tục phát triển ChatPHT, đồng thời phân biệt rõ phần mềm miễn phí, hạn mức miễn phí và hạ tầng không thể cam kết miễn phí vĩnh viễn.

> **Kết luận ngắn:** ChatPHT có thể giữ chi phí thấp để dùng thử hoặc nhóm nhỏ, nhưng **không có phương án nào bảo đảm toàn bộ chat, lưu trữ 200 GiB, video 1 GiB, push, gọi nhóm và AI đều miễn phí vĩnh viễn**. Các dịch vụ mạng, máy chủ, lưu trữ, relay cuộc gọi và nhà cung cấp nền tảng đều có hạn mức, chính sách hoặc chi phí vận hành.

## 1. Prompt triển khai tổng hợp

Sao chép nguyên khối nội dung dưới đây khi muốn giao cho đội phát triển tiếp tục nâng cấp ChatPHT.

```text
Bạn là kỹ sư trưởng Expo/React Native, Express/tRPC, Drizzle/MySQL và WebRTC. Hãy tiếp tục phát triển ứng dụng ChatPHT từ checkpoint ổn định hiện có. Tuyệt đối giữ nguyên mọi tính năng đang hoạt động; chỉ bổ sung hoặc sửa lỗi có kiểm thử hồi quy. Không xóa luồng dữ liệu, quyền bảo mật, media hay chức năng gọi hiện có nếu chưa có yêu cầu thay thế rõ ràng.

Mục tiêu sản phẩm: ChatPHT là ứng dụng Android-first để nhắn tin đa phương tiện, gọi thoại/video, chat nhóm, thông báo tức thì và quản trị dung lượng. Thiết kế ưu tiên điện thoại dọc 9:16, thao tác một tay, giao diện sáng gọn, vùng an toàn không bị bàn phím hoặc thanh điều hướng che, phản hồi chạm rõ ràng và không có nút chết.

A. Tài khoản, cá nhân và bảo mật
1. Giữ đăng ký/đăng nhập nhanh bằng tài khoản nội bộ; không bắt buộc đăng nhập Gmail.
2. Cho phép tìm bạn theo username; có danh bạ bạn bè và hồ sơ cá nhân.
3. Người dùng được đổi tên, tải avatar và thay hình nền riêng cho từng cuộc trò chuyện; có thanh chỉnh độ mờ hình nền để chữ dễ đọc.
4. Giữ khóa ứng dụng bằng PIN cục bộ, bảo quản PIN trong SecureStore, không lưu mật khẩu dạng rõ.
5. Giữ phân quyền admin: quản lý người dùng, thời hạn truy cập, quota, thống kê và thao tác quản trị có kiểm tra quyền ở backend.
6. Không công khai file media. Tất cả ảnh, video, avatar và wallpaper phải đi qua capability JWT theo phiên, kiểm tra thành viên cuộc trò chuyện, URL ký hết hạn một giờ và object key không chứa tên tệp gốc.

B. Nhắn tin 1:1 và chat nhóm
1. Giữ chat văn bản nhanh, trạng thái đang nhập, đã gửi/đã nhận/đã đọc và thời điểm đọc khi khả dụng.
2. Giữ reply theo tin nhắn, copy/chọn/dán/cắt nội dung, reaction emoji, thu hồi khi có quyền và xóa cuộc trò chuyện/nội dung chat theo phạm vi đã thiết kế.
3. Cho phép tạo nhóm có tên, avatar, tối đa 50 thành viên tính cả người tạo. Chủ nhóm có thể cấp/thu quyền admin; admin được thêm/xóa thành viên và đổi tên nhóm theo quyền backend.
4. Nhóm phải hỗ trợ text, reply, @mention gợi ý theo username, ghim tin nhắn, banner tin nhắn ghim và thông báo cho thành viên liên quan.
5. Không làm suy giảm inbox, danh bạ, tìm kiếm, trạng thái đã đọc hoặc các luồng chat 1:1 hiện có.

C. Media dung lượng lớn và hiệu năng
1. Giữ chọn ảnh/video từ thư viện hệ thống, chọn hỗn hợp tối đa 50 tệp một lần, video tối đa 1 GiB, ảnh tối đa 20 MiB.
2. Upload theo hàng đợi tối đa ba tệp đồng thời, hiển thị tiến trình từng tệp, phần trăm tổng và chỉ hoàn thành trạng thái khi request upload thực sự hoàn tất.
3. Hiển thị album media bằng lưới trong bong bóng chat; hỗ trợ xem ảnh/video toàn màn hình, lưu ảnh/video về thiết bị khi người dùng có quyền và xem trước có cache hợp lý.
4. Giữ quota logic 200 GiB, cảnh báo gần đầy, FIFO khi vượt ngưỡng, dọn media cũ lúc 02:00 theo giờ Việt Nam, vẫn giữ tin nhắn chữ và hiển thị thông báo khi file đã được dọn.
5. Admin phải xem được GB đã dùng/quota, 5 media gần nhất, quota lựa chọn 20/50/100/200 GiB hoặc không giới hạn, chính sách dọn và thời điểm dọn gần nhất.

D. Gọi thoại/video
1. Giữ gọi 1:1 thoại và video, camera trước/sau, mic, loa, tắt/mở camera, trạng thái chuẩn bị/đổ chuông/kết nối/lỗi, lịch sử cuộc gọi và cuộc gọi nhỡ.
2. Giữ full-screen incoming call, điều khiển ẩn/hiện khi chạm, thu nhỏ trong app, PiP Android khi native capability hỗ trợ, hiển thị ping/chất lượng LiveKit khi SDK có số liệu và nút SD/HD thủ công.
3. Gọi nhóm tối đa 8 người luôn đi qua LiveKit. Màn hình gọi nhóm phải có lưới video/audio, tên người tham gia, active-speaker highlight, join/leave đúng quyền, giới hạn 8 bằng transaction backend và thông báo push cho thành viên nhóm.
4. Gọi 1:1 ưu tiên P2P WebRTC với Google STUN. Chỉ tạo offer sau khi người nhận trả lời; signaling SDP/ICE phải được ủy quyền theo đúng hai thành viên, có TTL, xóa sau khi drain và không lộ qua API công khai.
5. Nếu P2P không kết nối sau đúng 5 giây hoặc không phải cuộc gọi trực tiếp hai người, tự fallback LiveKit và hiển thị rõ nhà cung cấp đang dùng. Không quảng cáo P2P là luôn kết nối được hoặc miễn phí không giới hạn.
6. Không hard-code TURN công khai. TURN production chỉ được thêm khi có máy chủ/dịch vụ có xác thực; secrets chỉ ở backend qua P2P_TURN_URLS, P2P_TURN_USERNAME và P2P_TURN_CREDENTIAL; app chỉ nhận ICE credential giới hạn theo đúng phiên gọi.

E. Push, nền và trải nghiệm Android
1. Giữ Firebase Cloud Messaging/Expo Push cho tin nhắn và cuộc gọi đến. Xin POST_NOTIFICATIONS đúng ngữ cảnh, đăng ký lại token khi đổi tài khoản và xử lý token DeviceNotRegistered.
2. Hiển thị thông báo đến trên khay hệ thống; tap vào thông báo nhóm phải mở đúng route nhóm/gọi nhóm. Có tùy chọn ẩn nội dung thông báo nếu người dùng chọn.
3. Giữ hướng dẫn Android về pin/chạy nền: chỉ giải thích và mở trang cài đặt khi người dùng đồng ý; không cố tự thay đổi cài đặt hệ thống.
4. Ghi nhận push receipt, retry/backoff có giới hạn và quan sát lỗi để tránh báo “đã gửi” khi chỉ mới nhận ticket.

F. AI và giới thiệu ứng dụng
1. Giữ khu vực hỏi đáp AI độc lập, thấy rõ câu hỏi và câu trả lời trong lịch sử; link web rút gọn, có thể chạm mở link; hỗ trợ thao tác text chuẩn.
2. AI phải có trạng thái đang xử lý, lỗi, giới hạn sử dụng và lưu ý quyền riêng tư. Không hứa AI miễn phí vô hạn khi chưa có nhà cung cấp/mô hình và ngân sách rõ ràng.
3. Giữ trang giới thiệu nêu người tạo “Phùng Hải Trường”, mô tả ngắn về ChatPHT và các chính sách riêng tư cần thiết.

G. Kiến trúc, chất lượng và bàn giao
1. Stack bắt buộc: Expo SDK 54, React Native, TypeScript, Expo Router, Express+tRPC, Drizzle/MySQL, kho object riêng tư có signed URL, LiveKit native SDK và WebRTC native.
2. Dùng ScreenContainer cho màn hình mới; Pressable dùng style thay vì className; dùng FlatList cho danh sách dài; không đưa secret vào app bundle, log, repo hay báo cáo.
3. Migration phải không phá hủy, có history rõ ràng. API mới cần schema Zod, authorization backend, test unit/integration cho quyền, giới hạn, fallback và hồi quy các luồng cũ.
4. Trước mỗi checkpoint: chạy TypeScript, lint, full test, backend build và Android export; báo chính xác số test đạt/bỏ qua/lỗi. Không tuyên bố P2P hoặc push hoạt động production nếu chưa nghiệm thu ít nhất hai Android trên Wi-Fi và mạng di động.
5. Cần nghiệm thu thực tế: media 50 tệp/1 GiB, quyền file, reply/mention/pin/role nhóm, nhóm 3–8 người, P2P cùng Wi-Fi và khác mạng, fallback 5 giây, push khi app bị vuốt đóng, SD/HD, mic/camera/camera switch/PiP, quota/FIFO và thống kê Admin.
6. Mỗi lần hoàn tất thay đổi phải cập nhật TODO, lưu checkpoint có mô tả trung thực và chỉ xuất bản khi người quản trị chủ động nhấn Publish.
```

## 2. Bảng phân loại “free” và sử dụng lâu dài

| Hạng mục đang dùng hoặc cần dùng | Trạng thái hiện tại | Có miễn phí? | Có thể hứa “vĩnh viễn”? | Kết luận thực tế |
|---|---|---:|---:|---|
| Expo SDK, React Native, TypeScript | Phần mềm mã nguồn mở để làm app | Có | Không | Không mất phí bản quyền hiện tại, nhưng phải cập nhật khi Android thay đổi. |
| FCM | Kênh push Android | Có theo chính sách hiện tại | Không | Firebase liệt kê Cloud Messaging là no-cost; việc giao thông báo vẫn phụ thuộc thiết bị, quyền và mạng. [1] |
| Expo Push Service | Backend hiện gửi qua Expo Push | Có theo chính sách hiện tại | Không | Expo nêu không tính phí, nhưng giới hạn 600 thông báo/giây/project và không SLA. [2] [3] |
| EAS Build để tạo APK/AAB | Đang dùng để build Android | Có hạn mức | Không | Gói Free hiện có 15 build Android/tháng ở hàng đợi thấp; quá hạn mức/gói khác có tính phí. [4] [5] |
| Cài APK thủ công | Đã có APK nội bộ | Có | Không | Không cần Google Play, nhưng người dùng phải cho phép cài nguồn ngoài và link artifact có thể hết hạn. |
| Google Play phát hành công khai | Chưa cần để cài thử | Không hoàn toàn | Không | Cần đăng ký Play Console, phí đăng ký và xác minh danh tính. [6] |
| LiveKit Cloud | Dùng cho gọi nhóm và fallback | Chỉ có tier/hạn mức tùy thời điểm | Không | Không được coi là gọi nhóm miễn phí vô hạn; call minutes và băng thông phát sinh theo nhà cung cấp. [7] |
| LiveKit tự vận hành | Phương án thay LiveKit Cloud | Mã nguồn mở | Không | Phần mềm có thể tự host, nhưng VPS, egress, giám sát và vận hành không miễn phí. [8] |
| WebRTC P2P + Google STUN | Gọi 1:1 ưu tiên | Không tính vào LiveKit nếu kết nối trực tiếp | Không | Có thể giảm relay, nhưng không vượt NAT/tường lửa trong mọi trường hợp; không có cam kết vận hành trong dự án. |
| TURN có xác thực | Chưa cấu hình theo quyết định hiện tại | Không nên giả định miễn phí | Không | Cần VPS/dịch vụ TURN có xác thực để tăng tỷ lệ kết nối; không dùng OpenRelay công khai làm production. |
| MySQL + object storage media riêng tư | Backend hiện có, quota logic 200 GiB | Phụ thuộc hạ tầng đang cấp | Không | Lưu trữ video 1 GiB và 200 GiB dữ liệu thực luôn cần tài nguyên máy chủ/băng thông. Cần xác nhận điều khoản nền tảng đang host. |
| AI hỏi đáp | Dùng backend LLM | Không thể xác nhận miễn phí | Không | Inference AI có quota hoặc chi phí theo nền tảng/mô hình; cần budget và giới hạn rõ ràng. |

> **Định nghĩa cần dùng đúng:** “miễn phí” là chính sách ở thời điểm kiểm tra, thường đi kèm quota hoặc không SLA. “Vĩnh viễn” đòi hỏi cam kết pháp lý và hạ tầng lâu dài; không dịch vụ đám mây, push, AI, domain, máy chủ hay store nào trong kiến trúc này nên được hứa như vậy.

## 3. Phương án vận hành theo mục tiêu

| Mục tiêu | Kiến trúc phù hợp | Điều cần chấp nhận |
|---|---|---|
| Cài thử cá nhân/nhóm nhỏ | APK nội bộ, FCM/Expo Push, P2P ưu tiên, LiveKit theo cấu hình sẵn có, quota theo dõi chặt | Không SLA; phải thử trên máy thật; link APK và hạn mức build có thể thay đổi. |
| Phát hành nhóm người dùng thật | APK/AAB có quy trình release, giám sát backend, quota/rate limit, kiểm thử 2 thiết bị, backup dữ liệu | Có chi phí hạ tầng hoặc hạn mức; cần người chịu trách nhiệm vận hành. |
| Mở rộng nhiều người/gọi nhóm thường xuyên | Backend/DB/object storage độc lập, LiveKit phù hợp tải, TURN có xác thực, logs/metrics/backup và quy trình sự cố | Không thể là mô hình “free vĩnh viễn”; phải lập ngân sách theo media, băng thông và phút gọi. |

Đối với **database, object storage và backend đang do nền tảng Manus quản lý**, cần kiểm tra trực tiếp tại [Trung tâm hỗ trợ Manus](https://help.manus.im) về quota, retention, điều khoản và chi phí áp dụng cho tài khoản của bạn. Báo cáo này không đưa ra cam kết về billing, hoàn tiền hay thời hạn dịch vụ của nền tảng.

## 4. Các quyết định nên chốt trước đợt nâng cấp tiếp theo

| Quyết định | Lý do cần chốt |
|---|---|
| Dùng APK nội bộ hay Google Play | Quyết định định dạng build, quy trình ký, kiểm thử và chi phí/pháp lý phát hành. |
| Giới hạn người dùng dự kiến và media/ngày | Quyết định quota thực, băng thông và lịch dọn media; không nên dựa vào con số 200 GiB nếu hạ tầng không có ngân sách tương ứng. |
| Mức độ tin cậy mong muốn cho gọi 1:1 | Nếu cần vượt NAT đáng tin cậy, phải chấp nhận TURN có xác thực hoặc dựa nhiều hơn vào LiveKit. |
| Có mở AI cho mọi người hay không | Quyết định cơ chế quota, chống lạm dụng, lọc dữ liệu nhạy cảm và chi phí inference. |
| Chính sách xóa/backup/khôi phục | Quyết định trải nghiệm người dùng, rủi ro mất dữ liệu và khả năng đáp ứng sự cố. |

## 5. Tiêu chí “đủ để phát hành”

Một bản ChatPHT chỉ nên được gọi là **sẵn sàng phát hành hạn chế** khi Android APK/AAB đã ký thành công, TypeScript/lint/build/Android export và toàn bộ test hồi quy đạt, đồng thời nghiệm thu thực tế trên tối thiểu hai Android. Bài nghiệm thu phải bao gồm nhắn tin, media, nhóm, role, push khi app tắt, camera/mic, gọi nhóm 3–8 người, P2P cùng và khác mạng, fallback 5 giây và kiểm tra quyền truy cập media.

Nếu chưa có TURN có xác thực và chưa thử trên các mạng khác nhau, mô tả chính xác là: **P2P có cơ chế ưu tiên và fallback, chưa phải cam kết kết nối trực tiếp ổn định cho mọi mạng**.

## Tài liệu tham khảo

[1]: [Firebase Cloud Messaging — Firebase](https://firebase.google.com/products/cloud-messaging)
[2]: [Push notifications troubleshooting and FAQ — Expo](https://docs.expo.dev/push-notifications/faq/)
[3]: [Send push notifications with the Expo Push Service — Expo](https://docs.expo.dev/push-notifications/sending-notifications/)
[4]: [Expo Application Services pricing — Expo](https://expo.dev/pricing)
[5]: [Subscriptions, plans, and add-ons — Expo](https://docs.expo.dev/billing/plans/)
[6]: [Get started with Play Console — Google Play Help](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)
[7]: [LiveKit pricing](https://livekit.com/pricing)
[8]: [Self-hosting LiveKit — LiveKit Docs](https://docs.livekit.io/transport/self-hosting/)
