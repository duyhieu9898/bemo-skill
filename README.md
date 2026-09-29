# Bemo Time Off Automation

Tự động hóa việc tạo Time Off request cho các ngày đi trễ trên Bemo Cloud, giúp tiết kiệm thời gian và đảm bảo độ chính xác.

## 📋 Tính năng chính

- **Đọc dữ liệu qua Odoo JSON-RPC**: Lấy chấm công và nghỉ phép trực tiếp từ API (không scrape giao diện).
- **So sánh thông minh**: Tìm ra chính xác những ngày đi trễ chưa có đơn nghỉ tương ứng.
- **Tạo đơn qua API**: Phát lại đúng dialog của giao diện (onchange do server tính), chọn loại phép theo thứ tự ưu tiên.
- **Luật an toàn cứng**: Kiểm tra trước khi lưu, đọc lại đơn theo id sau khi lưu.
- **Nghỉ cả ngày**: `npm run off:fullday -- DD/MM/YYYY`.
- **Checkout** vẫn dùng trình duyệt (Bemo gửi GPS/payload mã hoá khi chấm công).

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
│   ├── business-rules.js   # Lịch làm việc, ngưỡng đi trễ, thứ tự loại phép, giới hạn an toàn
│   ├── config.js           # Cấu hình kỹ thuật (URLs, đường dẫn, Chrome)
│   ├── login.js            # Đăng nhập và lưu session (browser)
│   ├── check-in-out.js     # Checkout (browser)
│   ├── get-attendance.js   # Lấy dữ liệu chấm công (API)
│   ├── get-timeoff.js      # Lấy dữ liệu nghỉ phép đã có (API)
│   ├── compare.js          # Đối soát tìm ngày cần tạo đơn
│   ├── create-timeoff.js   # Tạo đơn đi trễ từ action-needed.json
│   ├── create-full-day.js  # Tạo đơn nghỉ cả ngày
│   ├── verify-timeoff.js   # Dọn action-needed.json khi đơn đã tồn tại
│   ├── rpc/                # Client JSON-RPC, mô phỏng form Odoo, tạo đơn
│   ├── timeoff/            # Luật an toàn, chọn loại phép, khoá chạy đồng thời
│   └── utils/              # Helper (Browser, Date, File, Logger)
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
npm run data:sync -- --previous
```
*Kết quả: Danh sách ngày cần tạo đơn sẽ nằm trong `data/action-needed.json`.*

### Workflow an toàn qua Telegram

```text
/bemo_late
tạo timeoff Bemo, bỏ ngày 2026-07-01 2026-07-02
confirm bemo.create-timeoff <approval-token>
```

`/bemo_late` chỉ đọc dữ liệu. Yêu cầu natural-language tạo time-off sẽ khiến
agent gọi command có cấu trúc `bemo.prepare-timeoff` để tạo plan JSON gồm ngày
bị skip và ngày sẽ tạo, nhưng chưa gọi Bemo. Chỉ sau confirmation hợp lệ,
`bemo.create-timeoff` nhận đúng plan đó qua JSON stdin; wrapper kiểm tra
version, expiry, source digest, selected digest và chỉ chuyển các record đã chọn
sang create engine.

Các entrypoint workflow tương ứng trong package scripts:

| Script | Mục đích |
| :--- | :--- |
| `npm run workflow:late:list` | In danh sách ngày đi trễ hiện tại, không ghi dữ liệu lên Bemo. |
| `npm run workflow:timeoff:prepare` | Nhận JSON stdin `{ "skipDates": [...] }` và tạo plan có digest. |
| `npm run workflow:timeoff:create` | Nhận plan đã được preview/confirm qua JSON stdin và tạo các đơn đã chọn. |

### Bước 2: Tạo đơn

| Lệnh | Đặc điểm |
| :--- | :--- |
| `npm run run` | Trọn gói: `data:sync` rồi `off:create`. |
| `npm run off:create -- --dry-run` | Điền và kiểm tra toàn bộ, **không lưu**. Nên chạy trước lần tạo thật. |
| `npm run off:create` | Tạo đơn đi trễ cho các ngày trong `action-needed.json`, mỗi đơn được đọc lại theo id. |
| `npm run off:fullday -- 18/09/2026 [--reason "..."] [--dry-run]` | Tạo đơn nghỉ cả ngày (08:00 → 17:00). |
| `npm run off:verify` | Bỏ khỏi `action-needed.json` những ngày đã có đơn trên Bemo. |

Mã thoát khác 0 khi có đơn lỗi hoặc đơn **đã lưu nhưng sai** (in kèm id để kiểm tra trên Bemo).

### ⚙️ Lệnh bổ trợ khác
- `npm run auth`: Đăng nhập lại nếu bị hết hạn session.

## 🔒 Cơ chế bảo vệ & Logic nghiệp vụ

Mọi luật nghiệp vụ nằm ở `src/business-rules.js`.

- **Thứ tự loại phép**: `leaveTypePriority` (mặc định Annual Leave rồi Compensatory Leave); cùng loại thì dùng năm cũ trước; phải còn đủ số giờ.
- **Tách ngày nghỉ**: nếu không loại nào đủ 8h, đơn nghỉ cả ngày được tách theo thứ tự ưu tiên (vd 08:00–15:40 Annual + 15:40–17:00 Compensatory). Mọi phần được kiểm tra trước khi lưu phần đầu tiên. Tắt bằng `fullDayLeave.splitAcrossLeaveTypes: false`.
- **Luật cứng trước khi lưu** (không có cờ bỏ qua): ngày làm việc; đơn bắt đầu 08:00; đi trễ 7–60 phút và kết thúc trước 12:00; khớp giờ check-in và số phút trễ Bemo ghi nhận; tổng nghỉ trong ngày ≤ giờ làm việc (8h); không ở tương lai hoặc cũ hơn tháng trước; trạng thái chờ duyệt; đúng nhân viên đang đăng nhập; nghỉ cả ngày thì ngày đó không có chấm công.
- **Chống trùng lặp**: bỏ qua nếu đã có đơn còn hiệu lực trùng khung giờ; chỉ một lần tạo đơn chạy tại một thời điểm (khoá `data/.create-timeoff.lock`).

## 🐛 Xử lý sự cố (Troubleshooting)

- **Lỗi Login**: Chạy `npm run auth` để cập nhật lại session.
- **Lỗi lệch dữ liệu**: Nếu thấy danh sách tạo đơn không đúng, hãy chạy lại Bước 1 (Đồng bộ dữ liệu).
- **Lỗi Chrome** (login, checkout, lấy cookie session): Nếu script không tìm thấy trình duyệt, hãy đặt biến môi trường:
  `export PUPPETEER_EXECUTABLE_PATH=/đường/dẫn/đến/chrome`

## 📄 License
MIT
