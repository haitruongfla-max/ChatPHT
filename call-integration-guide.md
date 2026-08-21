# Hướng dẫn bổ sung gọi thoại và gọi video cho ChatPHT

**Tác giả:** Manus AI  
**Phạm vi:** Đề xuất tích hợp cuộc gọi 1-1 qua Internet, không thay đổi hoặc loại bỏ bất kỳ tính năng chat hiện có nào.

## Kết luận

**Có thể bổ sung gọi thoại và gọi video** vào ChatPHT. Phương án phù hợp là dùng WebRTC thông qua LiveKit, gồm SDK dành cho React Native/Expo ở điện thoại và một endpoint bảo mật trên backend ChatPHT để cấp mã vào phòng cuộc gọi. LiveKit có tài liệu tích hợp Expo chính thức, nhưng vì WebRTC dùng mã gốc nên không hoạt động trong Expo Go; cần tạo development build hoặc bản cài đặt ứng dụng mới để thử nghiệm trên iOS/Android [1].

> Cuộc gọi Internet **không tính cước phút gọi viễn thông**. Tuy nhiên, gọi thoại/video vẫn sử dụng dữ liệu Wi‑Fi hoặc gói 3G/4G/5G của mỗi người. Video dùng nhiều dữ liệu hơn thoại; vì vậy không thể cam kết cuộc gọi “không tốn dữ liệu”.

## Phương án nên chọn

| Phương án | Mức ổn định | Việc vận hành | Chi phí thực tế | Đánh giá cho ChatPHT |
|---|---:|---|---|---|
| **LiveKit Cloud** | Cao | Không cần tự quản lý máy chủ media/TURN | Có thể có hạn mức dùng thử; sau đó tính theo thời gian và dữ liệu truyền [2] | **Nên chọn cho giai đoạn đầu** vì nhanh, ổn định và ít rủi ro vận hành. |
| **Tự chạy LiveKit + TURN** | Cao nếu vận hành đúng | Cần máy chủ chạy liên tục, tên miền, TLS, IP công khai và theo dõi băng thông [3] | Không mất phí giấy phép LiveKit, nhưng vẫn trả tiền máy chủ và băng thông | Phù hợp sau khi lượng người dùng tăng hoặc cần tự kiểm soát hạ tầng. |
| **WebRTC P2P/STUN thuần** | Không ổn định trên mọi mạng | Ít thành phần ban đầu nhưng khó khắc phục lỗi kết nối | Có thể không mất phí hạ tầng media khi hai máy kết nối trực tiếp | **Không nên dùng** nếu yêu cầu cuộc gọi ổn định, vì nhiều mạng cần TURN để kết nối được. |

LiveKit Cloud đo cuộc gọi theo **thời gian và dữ liệu truyền**, còn tự triển khai cũng cần trả chi phí băng thông/máy chủ. Do đó, cách gọi “miễn phí” chính xác nhất là: *không có cước gọi qua nhà mạng, nhưng vẫn tiêu tốn dữ liệu Internet và có thể có chi phí hạ tầng* [2] [3].

## Kiến trúc bảo mật đề xuất

ChatPHT đã có đăng nhập, chat 1-1, quyền thành viên hội thoại và thông báo đẩy. Những phần này có thể được giữ nguyên, chỉ bổ sung một mô-đun gọi riêng. Backend hiện có thể kiểm tra người dùng là thành viên hội thoại trước khi cho phép tạo hoặc tham gia cuộc gọi; đây là lớp kiểm soát bắt buộc.

| Thành phần | Trách nhiệm | Nguyên tắc bảo mật |
|---|---|---|
| **Nút gọi trong khung chat** | Khởi tạo gọi thoại/video đến đúng người đang nhắn tin | Chỉ xuất hiện với hội thoại 1-1; không tự bật camera hay microphone. |
| **Backend ChatPHT** | Xác nhận cả hai người thuộc hội thoại, tạo phòng, cấp token ngắn hạn, gửi thông báo cuộc gọi | Không đưa `LIVEKIT_API_SECRET` xuống ứng dụng; chỉ backend được ký token. |
| **LiveKit/WebRTC** | Vận chuyển audio/video thời gian thực và dùng TURN khi hai mạng không thể kết nối trực tiếp | Dùng TLS, token giới hạn phòng, danh tính và thời hạn. |
| **Thông báo đẩy hiện có** | Báo cuộc gọi đến khi người nhận chưa mở khung chat | Payload chỉ có mã cuộc gọi và tên người gọi; không có token hoặc khóa bí mật. |
| **Màn hình cuộc gọi** | Nhận/từ chối, bật-tắt micro/camera, chuyển camera, loa ngoài và kết thúc | Tắt toàn bộ track camera/microphone ngay khi kết thúc hoặc bị từ chối. |

LiveKit hướng dẫn backend tự tạo JWT và bảo vệ endpoint cấp token bằng xác thực riêng; token chỉ trả về `server_url` và token tham gia phòng [4]. Với ChatPHT, token nên có thời hạn ngắn, ví dụ 5 phút trước khi vào phòng, và chỉ cấp cho **hai tài khoản là thành viên của đúng hội thoại**.

Mặc định, nên **không ghi âm, không ghi hình và không lưu nội dung media**. Nếu sau này cần mức bảo vệ cao hơn, LiveKit hỗ trợ mã hóa đầu cuối (E2EE) cho audio, video và data channel. E2EE đòi hỏi phân phối khóa qua kênh riêng an toàn; không được để khóa trong thông báo, log hoặc client bundle [5].

## Lộ trình triển khai không ảnh hưởng chức năng đang có

### Giai đoạn 1 — Gọi thoại 1-1 tối thiểu

Ở giai đoạn đầu, chỉ bổ sung hai nút **Gọi thoại** và **Gọi video** vào màn hình hội thoại hiện có, nhưng triển khai luồng thoại trước. Màn hình gọi có trạng thái đang gọi, đổ chuông, nhận, từ chối, tắt micro, loa ngoài và kết thúc. Đây là cách ít rủi ro nhất để kiểm tra chất lượng mạng, quyền microphone và luồng thông báo cuộc gọi mà không đụng đến gửi ảnh/video, cảm xúc, thu hồi, trạng thái đọc hoặc AI.

### Giai đoạn 2 — Video 1-1 và kiểm soát chất lượng

Sau khi thoại ổn định, mở camera theo thao tác rõ ràng của người dùng và hiển thị hai khung video. LiveKit có track camera/microphone, adaptive streaming và các cơ chế codec/chất lượng dành cho media thời gian thực [6]. Cần đặt chất lượng mặc định hợp lý cho mạng di động và đưa nút tắt video rõ ràng để tiết kiệm dữ liệu.

### Giai đoạn 3 — Gọi đến khi ứng dụng nền

Thông báo đẩy hiện có có thể báo “cuộc gọi đến” và mở màn gọi khi người dùng chạm. Muốn giao diện cuộc gọi đến kiểu điện thoại hệ thống, chạy tin cậy ở nền/khóa màn hình, cần tích hợp CallKit trên iOS và ConnectionService/Core Telecom trên Android, cùng cấu hình native và kiểm thử trên bản cài đặt thực tế. Đây là phần nâng cao, nên làm sau khi gọi trong ứng dụng đang mở đã hoạt động ổn định.

## Các bước kỹ thuật cụ thể

| Bước | Công việc cần làm | Kết quả mong đợi |
|---|---|---|
| 1 | Chọn LiveKit Cloud hoặc máy chủ LiveKit riêng. | Có `wss://...` công khai, TLS và TURN hoạt động. |
| 2 | Thêm SDK `@livekit/react-native`, plugin Expo và WebRTC theo tài liệu chính thức; gọi `registerGlobals()` khi ứng dụng khởi động [1]. | Ứng dụng có thể tạo track microphone/camera qua WebRTC. |
| 3 | Cập nhật cấu hình native với quyền camera và microphone, cùng lời giải thích riêng cho iOS. Expo yêu cầu các quyền native được cấu hình lúc tạo build [7]. | Người dùng chỉ nhận lời xin quyền khi thực sự dùng cuộc gọi. |
| 4 | Thêm thư viện server `livekit-server-sdk`; lưu URL, API key và API secret ở biến môi trường backend. | Bí mật LiveKit không xuất hiện ở app hoặc Git. |
| 5 | Tạo API bảo vệ: `call.start`, `call.answer`, `call.decline`, `call.end`, `call.getJoinToken`. Mỗi API xác thực thành viên hội thoại trước khi xử lý. | Người lạ không thể tự vào phòng hoặc giả mạo lời mời gọi. |
| 6 | Tạo bảng nhật ký cuộc gọi tối thiểu: mã gọi ngẫu nhiên, hội thoại, người gọi/nghe, loại gọi, trạng thái và thời điểm. | Có lịch sử cuộc gọi mà không lưu nội dung media. |
| 7 | Dùng hệ thống push hiện có để thông báo người nhận; payload không mang token LiveKit. | Nhận được cuộc gọi khi đang không mở đúng khung chat. |
| 8 | Tạo development build, kiểm thử hai thiết bị thật qua Wi‑Fi, 4G/5G và hai mạng khác nhau. | Phát hiện sớm lỗi quyền, NAT/TURN, âm thanh, camera và nền ứng dụng. |
| 9 | Kiểm thử hồi quy toàn bộ chat, media, AI, thông báo, khóa PIN và xóa hội thoại. | Tính năng hiện tại vẫn giữ nguyên. |

Ví dụ về **quy tắc cấp token**: `call.getJoinToken` chỉ nhận `callId`, lấy người dùng từ phiên đăng nhập, kiểm tra người dùng là người gọi hoặc người nhận của `callId`, kiểm tra cả hai vẫn là thành viên của `conversationId`, rồi mới ký JWT cho một room duy nhất. Client không tự gửi `userId`, `roomName` tùy ý hoặc `API secret`.

## Lưu ý trải nghiệm và quyền riêng tư

Người dùng phải nhìn thấy tên người đang gọi, loại cuộc gọi và nút **Nhận** hoặc **Từ chối** trước khi microphone/camera được kích hoạt. Nếu quyền bị từ chối, ứng dụng cần hiển thị hướng dẫn mở quyền trong Cài đặt thay vì lặp lại lời xin quyền. Expo lưu ý cấu hình quyền và phần mô tả trên iOS là một phần của native build và có thể ảnh hưởng việc xét duyệt cửa hàng ứng dụng [7].

Cuộc gọi phải tự kết thúc khi người dùng từ chối, đối phương hủy hoặc mất mạng quá thời hạn đã định. Cần hiển thị trạng thái “Đang kết nối lại” thay vì treo màn hình. Bản đầu tiên nên giới hạn **một cuộc gọi 1-1 tại một thời điểm**, không thu âm/ghi hình mặc định và không hỗ trợ phòng nhóm để kiểm soát chất lượng tốt hơn.

## Khuyến nghị cuối cùng

Tôi khuyến nghị bắt đầu bằng **LiveKit Cloud + gọi thoại 1-1 trong ứng dụng đang mở**, sau đó nâng cấp video và cuộc gọi nền. Phương án này bảo toàn toàn bộ ChatPHT hiện có, triển khai nhanh hơn tự vận hành, và có cơ chế TURN để tăng tỷ lệ kết nối giữa các mạng khác nhau. Khi số người dùng và lưu lượng đủ lớn, có thể chuyển sang LiveKit tự quản lý để kiểm soát hạ tầng tốt hơn.

Để bắt đầu triển khai, cần quyết định một trong hai lựa chọn: **LiveKit Cloud** (nhanh, dễ vận hành) hoặc **máy chủ LiveKit riêng** (nhiều quyền kiểm soát, nhưng cần server chạy liên tục). Sau lựa chọn đó, tôi có thể bổ sung theo từng giai đoạn, bắt đầu với gọi thoại 1-1 và không thay đổi các tính năng hiện tại.

## Tài liệu tham khảo

[1] [LiveKit — Expo quickstart](https://docs.livekit.io/transport/sdk-platforms/expo/)  
[2] [LiveKit — Cloud billing](https://docs.livekit.io/deploy/admin/billing/)  
[3] [LiveKit — Self-hosted deployment and TURN](https://docs.livekit.io/transport/self-hosting/deployment/)  
[4] [LiveKit — Endpoint token generation](https://docs.livekit.io/frontends/build/authentication/endpoint/)  
[5] [LiveKit — End-to-end encryption](https://docs.livekit.io/transport/encryption/start/)  
[6] [LiveKit — Realtime media overview](https://docs.livekit.io/transport/media/)  
[7] [Expo — Permissions](https://docs.expo.dev/guides/permissions/)
