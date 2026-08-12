# DÒNG TIỀN — Web app quản lý thu chi dự án

Web app tĩnh (chạy được trên GitHub Pages), dùng **Firebase (Auth + Firestore)** làm backend miễn phí, đồng bộ dữ liệu real-time cho nhiều người dùng.

## Tính năng
1. Đọc hiểu số liệu từ file Excel gốc → thiết kế lại thành cấu trúc dữ liệu chuẩn hoá.
2. **Thu chi**: popup nhập liệu dòng tiền vào/ra theo từng dự án.
3. **Hóa đơn**: thống kê tự động các giao dịch có gắn số hóa đơn.
4. **Chuyển khoản**: thống kê tự động các giao dịch có thông tin ngân hàng.
5. **Báo cáo dòng tiền theo kỳ**: theo ngày / tháng / năm, có biểu đồ.
6. **Báo cáo lãi lỗ**: theo quý / năm, toàn công ty hoặc theo từng dự án.
7. **Lệnh chi**: tạo, duyệt theo trạng thái (chờ duyệt / đã duyệt / đã chi), in lệnh chi.
8. **Bảng lương / chấm công**: chấm công theo ngày cho từng nhân viên, tự tổng hợp bảng lương theo tháng.

## Bước 1 — Tạo Firebase project (miễn phí)
Xem hướng dẫn 5 bước mình đã gửi trong chat (tạo project → bật Firestore → bật Authentication → lấy config → dán Firestore Rules trong file `firestore.rules`).

## Bước 2 — Điền config vào app
Mở file `js/firebase-config.js`, thay các giá trị `YOUR_...` bằng config thật lấy từ Firebase Console.

## Bước 3 — Tạo tài khoản đăng nhập cho team
Trong Firebase Console → Authentication → Users → Add user, tạo email + mật khẩu cho từng thành viên (2-5 người). App **không có** chức năng tự đăng ký — chỉ những ai được bạn cấp tài khoản mới đăng nhập được.

## Bước 4 — Dán Firestore Rules
Vào Firebase Console → Firestore Database → tab Rules → dán nội dung file `firestore.rules` → Publish. Việc này đảm bảo chỉ người đã đăng nhập mới đọc/ghi được dữ liệu, an toàn khi code public trên GitHub.

## Bước 5 — Đưa lên GitHub Pages
```bash
# Trong thư mục cashflow-app
git init
git add .
git commit -m "Init cash flow app"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```
Sau đó vào repo trên GitHub → **Settings → Pages** → Source chọn nhánh `main`, thư mục `/ (root)` → Save.
Sau vài phút, app sẽ chạy tại: `https://<username>.github.io/<repo>/`

> Lưu ý: `js/firebase-config.js` chứa `apiKey` — với Firebase, apiKey **không phải bí mật tuyệt đối** (nó chỉ định danh project), sự an toàn thực sự nằm ở **Firestore Rules** (bước 4) và **Authentication** (bước 3). Đừng bỏ qua 2 bước đó.

## Cấu trúc dữ liệu (Firestore collections)
- `projects` — danh sách dự án, giá trị hợp đồng, dự toán chi phí/doanh thu
- `transactions` — từng dòng thu/chi, gắn dự án, kèm thông tin hóa đơn + chuyển khoản
- `paymentOrders` — lệnh chi
- `employees` — danh sách nhân viên
- `timesheets` — chấm công theo ngày

## Nhập dữ liệu cũ từ Excel
App hiện chưa có tính năng import Excel tự động (có thể bổ sung sau nếu bạn cần). Trước mắt: dùng popup "+ Thêm dự án" và "+ Nhập giao dịch" để nhập dữ liệu, hoặc cho mình biết nếu bạn muốn mình viết thêm chức năng import hàng loạt từ file Excel gốc.

## Có thể mở rộng thêm (nếu cần)
- Import Excel hàng loạt (để đưa toàn bộ lịch sử cũ vào app)
- Xuất báo cáo ra PDF/Excel
- Phân quyền chi tiết (kế toán / quản lý / giám đốc)
- Đính kèm ảnh scan hóa đơn (cần nâng Firebase lên gói Blaze)
