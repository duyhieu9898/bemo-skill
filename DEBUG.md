# 🛠️ Hướng dẫn Debug Bemo Automation

Tài liệu này hướng dẫn cách sử dụng Logs và các công cụ có sẵn để kiểm tra lỗi khi script không chạy như ý muốn.

## 📂 Các loại Log Files

Hệ thống lưu trữ log tại thư mục `logs/`:

1.  **`logs/bemo.log`**: 
    - **Đặc điểm**: Dễ đọc, chứa các dòng text tóm tắt quá trình chạy.
    - **Khi nào dùng**: Để xem nhanh tổng quan script đã làm gì, lỗi lớn nhất là gì.
    - **Nội dung**: Các icon ✅ ❌ ⚠️ và thông báo ngắn gọn.

2.  **`logs/create-timeoff.json`**:
    - **Đặc điểm**: Chứa dữ liệu kỹ thuật chi tiết dưới dạng JSON (bao gồm biến số, kết quả từ trình duyệt).
    - **Khi nào dùng**: Khi cần debug sâu tại sao một bước cụ thể (như điền form hay chọn loại phép) bị lỗi.
    - **Nội dung**: `timestamp`, `action`, và các data trả về từ Puppeteer.

---

## 🔍 Phân tích các lỗi thường gặp

### 1. Lỗi "Not logged in"
*   **Dấu hiệu**: Xuất hiện ngay khi bắt đầu chạy các script lấy dữ liệu hoặc tạo đơn.
*   **Nguyên nhân**: Session Chrome đã hết hạn hoặc file profile bị lỗi.
*   **Cách sửa**: Chạy `node src/login.js` để đăng nhập lại thủ công.

### 2. Lỗi "Insufficient Annual Leave balance"
*   **Dấu hiệu**: Script báo bỏ qua (skip) một ngày cụ thể.
*   **Kiểm tra**: Mở `logs/create-timeoff.json`, tìm action `checkLeaveBalance_start`. Xem danh sách `extractedTypes` để biết thực tế Bemo đang báo bạn còn bao nhiêu phép cho từng năm.
*   **Nguyên nhân**: Số giờ phép còn lại ít hơn số giờ bạn đi trễ.

### 3. Lỗi "Form fill failed" hoặc "Form date mismatch"
*   **Dấu hiệu**: Script dừng lại khi đang điền đơn.
*   **Kiểm tra**: Xem `logs/create-timeoff.json` phần `fillResult`. Nếu `start` hoặc `end` là `false`, nghĩa là CSS Selector của ô ngày tháng đã thay đổi.
*   **Cách sửa**: Kiểm tra lại các selector trong `src/timeoff/form.js`.

### 4. Lỗi "Duration validation failed"
*   **Dấu hiệu**: Script điền xong nhưng không nhấn Save vì số phút nghỉ không khớp.
*   **Kiểm tra**: Xem `logs/create-timeoff.json` phần `durationValidation`. 
*   **Nguyên nhân**: 
    - Thường do Bemo tính toán thời gian nghỉ khác với logic của script (ví dụ: trừ giờ nghỉ trưa hoặc quy định làm tròn).
    - Đi trễ quá lâu (> 60 phút) vượt quá giới hạn an toàn (`maxLateMinutes`).

---

## 📺 Kỹ thuật Debug trực quan (Visual Debug)

Nếu đọc log vẫn chưa hiểu chuyện gì đang xảy ra, hãy sử dụng flag `--show`:

```bash
node src/create-timeoff.js --show
```

**Các bước debug trực quan:**
1.  Quan sát trình duyệt xem script có click đúng ô dropdown không.
2.  Xem các giá trị ngày tháng có được điền đúng định dạng không.
3.  Khi script dừng lại (do lỗi), hãy giữ nguyên trình duyệt và dùng **F12 (Inspect Element)** để kiểm tra các class CSS xem có thay đổi không so với code trong `src/timeoff/ui.js` và `src/timeoff/form.js`.

---

## 🛠️ Cách đọc Log JSON cho AI/Developer

Mỗi entry trong `create-timeoff.json` thường có cấu trúc:
```json
{
  "timestamp": "2024-04-02T07:45:12.123Z",
  "action": "action_name",
  "data": { ... }
}
```

**Các `action` quan trọng cần chú ý:**
- `getLeaveTypes_end`: Dữ liệu thô quét được từ dropdown loại phép.
- `selectLeaveType_action`: Kết quả click chọn loại phép.
- `form_fill_duration_wait_timeout`: Nếu thấy action này, nghĩa là trang web phản hồi quá chậm sau khi điền ngày tháng.
- `createOne_navigation_error`: Lỗi khi nhấn nút "New" hoặc tải trang tạo mới.

## ♻️ Lưu ý về dọn dẹp Log
File JSON log sẽ tự động giữ lại **1000 dòng mới nhất** để tránh làm đầy đĩa cứng của bạn. Nếu cần bắt đầu lại từ đầu, bạn có thể xóa file trong thư mục `logs/` bất cứ lúc nào.
