# Nếp — Quản lý công việc

Ứng dụng Todo list dùng React, TypeScript, Vite, Tailwind CSS và React Router.

## Chạy trong môi trường phát triển

```bash
npm install
npm run dev
```

Tạo file `.env` từ `.env.example` để cấu hình môi trường. Các lệnh kiểm tra:

```bash
npm run build
npm run lint
```

Giao diện hỗ trợ sáng/tối ở trang xác thực và không gian làm việc, tôn trọng
thiết lập giảm chuyển động của hệ điều hành, và cung cấp điều hướng bàn phím
cho drawer/dialog cũng như các thao tác kéo thả.

## Biến môi trường

| Biến | Mặc định | Mục đích |
|---|---|---|
| `VITE_USE_MOCK` | `true` | Dùng dữ liệu mô phỏng trong trình duyệt khi backend chưa sẵn sàng. |
| `VITE_API_URL` | `http://localhost:3000/api` | URL gốc của API khi dùng triển khai HTTP. |

## Luồng xác thực mô phỏng

Khi `VITE_USE_MOCK` không phải `false`, dữ liệu auth được lưu trong
`localStorage`. Có thể tạo tài khoản ở `/register`, xác thực bằng liên kết
kiểm thử hiển thị sau đăng ký, rồi đăng nhập. Liên kết xác thực có thời hạn 24
giờ; liên kết đặt lại mật khẩu có thời hạn 30 phút và chỉ dùng một lần.

Tài khoản mẫu được tạo tự động:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Người dùng | `demo@nep.local` | `NepDemo2026!` |
| Quản trị viên | `admin@nep.local` | `NepAdmin2026!` |

## Danh sách công việc mô phỏng

Workspace mock được lưu riêng theo từng tài khoản trong `localStorage`. Hai
tài khoản mẫu có sẵn các project, section, label, task quá hạn/đến hạn/sắp tới,
sub-task, comment và task đã hoàn thành để thử các màn Inbox, Hôm nay, Sắp tới
và Project. Tài khoản vừa đăng ký bắt đầu với Inbox trống. Dùng nút tay nắm
kéo ở mỗi task để đổi thứ tự giữa các task cùng cấp hoặc chuyển task gốc sang
section khác; kéo project ở thanh bên để sắp xếp danh sách project. Có thể dùng
bàn phím trên các tay nắm (Space/Enter để bắt đầu/kết thúc, phím mũi tên để di
chuyển). Thứ tự được cập nhật lạc quan và tự khôi phục nếu request thất bại.

Có thể hoàn thành task để ghi nhận trạng thái và hoàn tác ngay từ thông báo;
hoàn thành task cha cũng hoàn thành các sub-task chưa xong. Trong project có thể
thêm, đổi tên hoặc xóa section. Xóa section sẽ xóa mềm các task trong section
và cây sub-task liên quan trong mock.

Nút **Thêm nhanh** hoặc phím `q` mở form tạo task với mô tả, ngày/giờ, mức ưu
tiên, project/section và label. Ngày nhập được hỗ trợ ở dạng `YYYY-MM-DD`,
`today`/`hôm nay`, `tomorrow`/`ngày mai`, hoặc tên thứ bằng tiếng Anh/Việt
(ví dụ `next monday`, `thứ 2`). Đây là bộ phân tích cú pháp cơ bản, không phải
bộ hiểu ngôn ngữ tự nhiên đầy đủ.

Mở **Chi tiết task** để chỉnh sửa, tạo sub-task (tối đa ba cấp tính cả task
gốc), tạo/gắn nhiều label, thêm/xóa bình luận và chọn lịch lặp hàng ngày, hàng
tuần hoặc hàng tháng với khoảng cách tối đa 365. Lịch lặp được lưu thành RRULE
dạng `FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=N`; mock chỉ hỗ trợ các dạng này. Khi
hoàn thành task lặp, mock ghi nhận lần hoàn thành và dời hạn sang kỳ tiếp theo
thay vì chuyển task sang `COMPLETED`.

Trang **Thống kê** tổng hợp các lần hoàn thành theo ngày/tuần và project, cùng
số task quá hạn theo project. Chọn phạm vi 7, 30 hoặc 90 ngày; ngày/tuần được
tính theo múi giờ tài khoản. Mock bỏ các completion đã hoàn tác khỏi thống kê.

Để giả lập lỗi ở request tiếp theo trong trình duyệt:

```js
localStorage.setItem('nep.mock.failNext', 'true')
```

Mock chỉ phục vụ bài tập giao diện; hash mật khẩu và phiên trong trình duyệt
không thay thế cơ chế bảo mật phía máy chủ. Khi backend sẵn sàng, đặt
`VITE_USE_MOCK=false` và cấu hình `VITE_API_URL`.
