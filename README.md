# Bemo Time Off Automation

Tự động hóa việc tạo Time Off request cho các ngày đi trễ trên Bemo Cloud, giúp tiết kiệm thời gian và đảm bảo độ chính xác.

## 📋 Tính năng chính

- **Quét dữ liệu**: Tự động lấy dữ liệu chấm công và nghỉ phép từ Bemo.
- **So sánh thông minh**: Tìm ra chính xác những ngày đi trễ chưa có đơn nghỉ tương ứng.
- **Tạo đơn tự động**: Điền form, chọn loại phép tối ưu (ưu tiên phép năm cũ), và thực hiện lưu đơn.
- **Xác thực đa lớp**: Kiểm tra tính hợp lệ của dữ liệu trước khi lưu và xác nhận sự tồn tại của đơn sau khi lưu.
- **Chế độ Fast Mode**: Tối ưu hóa tốc độ khi cần tạo số lượng lớn đơn cùng lúc.

## 🚀 Cài đặt

```bash
# Cài đặt dependencies
npm install
```

### Yêu cầu
- **Node.js**: Phiên bản 14 trở lên.
- **Chrome/Chromium**: Đã cài đặt trên máy (script sẽ tự động tìm đường dẫn).

## 📁 Cấu trúc dự án

```
bemo/
├── src/
│   ├── config.js           # Cấu hình URLs, rules và các chỉ số cột
│   ├── login.js            # Đăng nhập và lưu session
│   ├── get-attendance.js   # Thu thập dữ liệu chấm công
│   ├── get-timeoff.js      # Thu thập dữ liệu nghỉ phép đã có
│   ├── compare.js          # Đối soát tìm ngày cần tạo đơn
│   ├── create-timeoff.js   # Logic tạo đơn (Core engine)
│   ├── verify-timeoff.js   # Script xác thực hàng loạt (Batch verify)
│   └── utils/              # Thư viện helper (Browser, Date, File, Logger)
└── data/                   # Nơi lưu trữ dữ liệu JSON
```

## 🔧 Hướng dẫn sử dụng (Workflow)

### Bước 1: Chuẩn bị dữ liệu
Mặc định hệ thống sẽ đồng bộ dữ liệu của **tháng hiện tại (Current Month)**. Chạy lệnh:
```bash
npm run data:sync
```

Nếu muốn đồng bộ dữ liệu của **tháng trước (Previous Month)**, bạn chạy lệnh:
```bash
node src/get-attendance.js --previous && node src/get-timeoff.js --previous && node src/compare.js
```
*Kết quả: Danh sách ngày cần tạo đơn sẽ nằm trong `data/action-needed.json`.*

### Bước 2: Tạo đơn tự động
Bạn có thể chọn chạy trọn gói (All-in-one) hoặc chạy theo từng chế độ riêng biệt.

#### 1. Chạy trọn gói (Khuyên dùng)
Dành cho trường hợp muốn thực hiện nhanh toàn bộ quy trình (Sync -> Create -> Verify).
- **Chạy ẩn (Headless)**: `npm run run`
- **Chạy hiện trình duyệt**: `npm run run:show`

#### 2. Các chế độ tùy chọn
Dành cho nhu cầu kiểm soát kỹ hơn từng đơn hoặc khi hệ thống có thay đổi.

| Chế độ | Lệnh | Đặc điểm |
| :--- | :--- | :--- |
| **Tiêu chuẩn** | `npm run off:create` | Tạo xong đơn nào xác thực đơn đó. Chậm nhưng an toàn. |
| **Nhanh** | `npm run off:fast` | Tạo liên tục không đợi xác thực. Tốt nhất cho số lượng lớn (>5 đơn). |
| **Thủ công** | `npm run off:manual` | Script điền sẵn form, bạn tự kiểm tra và nhấn Save. |
| **Xác thực** | `npm run off:verify` | Quét lại toàn bộ đơn để dọn dẹp danh sách chờ. |

### ⚙️ Lệnh bổ trợ khác
- `npm run auth`: Đăng nhập lại nếu bị hết hạn session.
- `npm run data:clean`: Xóa sạch dữ liệu tạm trong thư mục `data/`.

## 🔒 Cơ chế bảo vệ & Logic nghiệp vụ

- **Ưu tiên phép (FIFO)**: Luôn sử dụng Annual Leave của các năm cũ nhất trước để tránh hết hạn phép.
- **Kiểm tra số dư**: Script sẽ báo lỗi và bỏ qua nếu số dư phép không đủ cho số giờ nghỉ.
- **Ràng buộc thời gian**: Chỉ tạo đơn cho những ngày đi trễ vượt quá `minLateMinutes` (mặc định 7p) trong `config.js`.
- **Chống trùng lặp**: File `action-needed.json` chỉ được dọn dẹp khi đơn đã được xác nhận tồn tại trên hệ thống Bemo.

## 🐛 Xử lý sự cố (Troubleshooting)

- **Lỗi Login**: Chạy `npm run auth` để cập nhật lại session.
- **Lỗi lệch dữ liệu**: Nếu thấy danh sách tạo đơn không đúng, hãy chạy lại Bước 1 (Đồng bộ dữ liệu).
- **Lỗi Chrome**: Nếu script không tìm thấy trình duyệt, hãy đặt biến môi trường:
  `export PUPPETEER_EXECUTABLE_PATH=/đường/dẫn/đến/chrome`

## 📄 License
MIT
