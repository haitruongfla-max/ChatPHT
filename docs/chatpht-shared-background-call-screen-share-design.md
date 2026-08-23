# Thiết kế tương thích: nền chung, gọi tiết kiệm và chia sẻ màn hình

Ngày thiết kế: 23-08-2026 (GMT+7). Tài liệu này mô tả thay đổi **bổ sung**, không loại bỏ chat riêng tư/nhóm, gọi 1:1, gọi nhóm tối đa 8 người, quota 200 GiB, FIFO, cron 02:00, quản trị hay cơ chế đang trực tuyến.

## Nguyên tắc an toàn

Ảnh nền không lưu URL công khai lâu dài. Bảng `conversations` sẽ giữ **khóa object riêng tư** (`backgroundKey`), kích thước byte, độ mờ và thời điểm cập nhật; API chỉ cấp URL tải có chữ ký sau khi kiểm tra thành viên. Cách này thực hiện mục tiêu “lưu nền trong database theo conversation” mà không công khai dữ liệu hội thoại. Ảnh nền kế thừa theo từng thành viên vẫn được giữ nguyên trong dữ liệu cũ để không gây mất dữ liệu; từ lần đặt nền mới đầu tiên, nền chung sẽ là nguồn hiển thị cho mọi thành viên.

| Phạm vi | Quyết định tương thích |
|---|---|
| Migration | Chỉ `ADD COLUMN` cho `conversations`: `backgroundKey`, `backgroundSize`, `backgroundOpacity`, `backgroundUpdatedAt`; không xóa cột nền cũ của `conversation_members`. |
| Phân quyền | Thành viên của chat riêng tư/nhóm có thể đặt nền chung; yêu cầu upload, thay nền, lấy URL và tham gia room realtime đều kiểm tra membership. |
| Quota | Ảnh nền được đưa vào tổng dung lượng 200 GiB. Khi đổi nền, ảnh cũ bị xóa sau khi khóa mới đã cập nhật; FIFO vẫn ưu tiên dọn **media tin nhắn cũ**, không tự xóa nền đang dùng. |
| Đồng bộ | Server phát sự kiện `background_updated` theo room của conversation với chỉ `conversationId` và `backgroundUpdatedAt`; app nhận sự kiện để vô hiệu hóa query nền và tải lại URL ký. Nếu kênh realtime bị chặn, polling nhẹ là dự phòng. |
| Xóa sạch chat | Giữ luồng xóa message/media chung hiện có, không xóa thành viên, tài khoản, nền chung hoặc quyền nhóm ngoài ý muốn. |

## Chính sách gọi

Cuộc gọi riêng bắt đầu P2P qua STUN Google. Thời hạn chờ trước fallback LiveKit đổi thành **6 giây**. Khi kết nối P2P mất tạm thời, phía khởi tạo thử ICE restart có điều phối signaling trước; nếu phục hồi không thành trong cửa sổ bảo vệ thì mới chuyển LiveKit. Điều này giảm dùng SFU nhưng không thể đảm bảo P2P đi xuyên mọi NAT hoặc mạng doanh nghiệp.

| Loại gọi | Transport mặc định | Chất lượng video | Phục hồi |
|---|---|---|---|
| 1:1 không chia sẻ màn hình | P2P | HD do người dùng chọn; giảm khi người dùng chuyển SD | ICE restart, sau đó fallback LiveKit có kiểm soát. |
| 1:1 có chia sẻ màn hình | LiveKit sau khi xác nhận chuyển transport | Camera giữ theo lựa chọn, screen share ưu tiên khả dụng | Dùng cơ chế reconnect của LiveKit; audio được giữ ưu tiên hơn video. |
| Nhóm 3–8 người | LiveKit SFU | 480p mặc định, HD 720p theo nút; 360p khi ping từ 250 ms hoặc chất lượng `poor` | `adaptiveStream`, `dynacast`, simulcast và reconnect của room. |

Mục tiêu là **giảm** tiêu thụ LiveKit và giữ cuộc gọi tốt nhất có thể, không phải cam kết dịch vụ “miễn phí vĩnh viễn”. Chia sẻ màn hình đi qua SFU vẫn dùng băng thông/phút của hạ tầng LiveKit. Android cấp quyền MediaProjection bằng hộp thoại hệ thống và app cần `FOREGROUND_SERVICE_MEDIA_PROJECTION`; LiveKit hướng dẫn publish screen-share như track video trong room.[1] [2]

## Chia sẻ màn hình và giao diện cuộc gọi

Khi người dùng bấm **Chia sẻ màn hình**, app yêu cầu quyền ghi hình Android rồi publish track `ScreenShare` trong room LiveKit; micro không bị tắt. Với nhóm, room LiveKit hiện có được tái dùng. Với cuộc gọi P2P 1:1, app hiện thông báo ngắn và chuyển có điều phối sang LiveKit trước khi bật chia sẻ, vì P2P không có room LiveKit để publish track. Tắt chia sẻ sẽ unpublish track và giữ cuộc gọi đang diễn ra.

> Không dùng URL ảnh nền hoặc payload screen-share trong sự kiện realtime. Event chỉ là tín hiệu làm mới; quyền tải vẫn được kiểm tra ở API riêng tư.

Video stage ưu tiên màn hình đang được chia sẻ ở vùng lớn giữa màn hình. Camera người tham gia nằm ở strip thu nhỏ phía trên; preview cục bộ của người chia sẻ luôn hiển thị để nhận biết trạng thái. Hàng điều khiển có micro, loa, camera, chia sẻ màn hình, đổi camera, SD/HD và kết thúc; thao tác “Trò chuyện” thu nhỏ call về bong bóng để người dùng chat song song trong hội thoại. Nút điều khiển ẩn/hiện bằng chạm một lần như bố cục gọi hiện có.

## Kiểm thử bắt buộc

Kiểm thử tự động sẽ bao phủ migration, quyền membership, quota nền, event invalidation, lựa chọn transport 6 giây, ICE restart, lựa chọn 480p/360p và trạng thái screen-share. Nghiệm thu thật vẫn cần hai Android: P2P cùng Wi-Fi/4G, fallback LiveKit, gọi nhóm 3+ người, cấp/từ chối MediaProjection, dừng chia sẻ, hạ mạng mô phỏng và quay lại chat qua bong bóng.

## Tài liệu tham chiếu

[1]: https://docs.livekit.io/transport/media/screenshare/ "LiveKit: Screen sharing"
[2]: https://docs.livekit.io/transport/sdk-platforms/react-native/ "LiveKit: React Native SDK"
