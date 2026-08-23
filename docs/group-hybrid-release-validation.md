# Nghiệm thu kỹ thuật: Chat nhóm, gọi nhóm và hybrid P2P

Ngày cập nhật: 23-08-2026 (GMT+7)

## Phạm vi đã hoàn thành

ChatPHT hiện có luồng tạo và quản trị nhóm tối đa 50 thành viên. Người tạo nhóm có thể cấp hoặc thu quyền quản trị viên; quản trị viên được phép đổi tên, ảnh đại diện, thêm hoặc xóa thành viên theo các quy tắc quyền ở server. Chat nhóm hỗ trợ album media hiện hữu với tối đa 50 tệp, video tối đa 1 GiB, ghim tin nhắn, trả lời theo ngữ cảnh và gợi ý nhắc tên.

Cuộc gọi nhóm sử dụng LiveKit và giới hạn tối đa 8 người tham gia hoạt động. Màn gọi hiển thị lưới participant, làm nổi người đang nói khi SDK cung cấp trạng thái, và cho phép người dùng tự chọn chất lượng camera SD hoặc HD. Thành viên thường có thể rời phòng; chủ phòng có quyền kết thúc phòng. Thông báo cuộc gọi nhóm mang cờ điều hướng riêng để không bị xử lý như cuộc gọi 1:1.

Cuộc gọi trực tiếp có chính sách hybrid: chỉ hai thành viên của một cuộc gọi 1:1 mới thử WebRTC P2P; cuộc gọi nhóm luôn dùng LiveKit. Signaling offer, answer và ICE được cô lập theo phiên cùng hai thành viên có quyền. Khi P2P không thiết lập được trong năm giây sau khi bên nhận trả lời, ứng dụng mới xin token LiveKit ngắn hạn và chuyển sang LiveKit. Cấu hình ICE mặc định chỉ dùng STUN Google; TURN là tùy chọn, được server trả theo từng phiên sau khi có cấu hình bí mật hợp lệ.

## Kiểm tra tự động đã thực hiện

| Hạng mục | Kết quả |
|---|---|
| TypeScript (`pnpm check`) | Đạt |
| Kiểm thử hồi quy Vitest một fork | **101 đạt, 2 bỏ qua có chủ đích** |
| Lint Expo (`pnpm lint`) | Đạt; Node báo cảnh báo kiểu module của cấu hình ESLint, không phải lỗi lint |
| Đóng gói backend (`pnpm build`) | Đạt |
| Xuất bundle Android (`npx expo export --platform android`) | Đạt |
| Rà soát diff (`git diff --check`) | Đạt |
| Expo Doctor | 17/18; cảnh báo metadata New Architecture của `expo-pip` và thiếu metadata cho plugin LiveKit, chưa phải lỗi biên dịch |

Các hồi quy bổ sung khóa quyền tạo/quản trị nhóm, giới hạn 50 thành viên, gọi nhóm, thông báo gọi nhóm, signaling P2P, cấu hình ICE theo phiên, fallback LiveKit và thống kê Admin.

## Điều kiện phải nghiệm thu trên thiết bị trước khi phát hành

Không thể xác minh media WebRTC, NAT traversal, trạng thái active-speaker hoặc tính tương thích OEM Android chỉ bằng bundle và unit test. Cần thực hiện các bước sau trên ít nhất hai thiết bị Android thật, ưu tiên ở hai mạng khác nhau:

1. Gọi P2P 1:1 qua Wi-Fi và di động; xác nhận âm thanh, video, micro, camera trước/sau và thao tác kết thúc.
2. Chặn hoặc làm thất bại P2P để xác nhận tự chuyển LiveKit sau khoảng năm giây kể từ lúc bên nhận trả lời.
3. Kiểm tra phòng LiveKit nhóm với 3 đến 8 người: tham gia/rời, lưới video, người đang nói, SD/HD và quyền kết thúc phòng.
4. Kiểm tra avatar nhóm, media album 50 tệp và nhận thông báo gọi nhóm khi ứng dụng ở nền.
5. Nếu cần TURN, thêm nhà cung cấp TURN có thông tin xác thực hợp lệ vào bí mật backend. Không nên dùng relay OpenRelay công khai làm hạ tầng production hoặc cam kết dung lượng miễn phí cố định.

> Trạng thái hiện tại đủ để tiếp tục kiểm thử thiết bị và tạo bản phát hành kiểm thử. Không nên tuyên bố P2P hoặc TURN vận hành ổn định trong mọi điều kiện mạng trước khi hoàn tất các ca nghiệm thu thực tế ở trên.
