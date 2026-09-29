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
    - **Nội dung**: `timestamp`, `action`, và dữ liệu gửi/nhận qua JSON-RPC.

---

## 🔍 Phân tích các lỗi thường gặp

### 1. Lỗi "Not logged in"
*   **Dấu hiệu**: Xuất hiện ngay khi bắt đầu chạy các script lấy dữ liệu hoặc tạo đơn.
*   **Nguyên nhân**: Session Bemo (cookie trong Chrome profile) đã hết hạn.
*   **Cách sửa**: Chạy `npm run auth`.

### 2. Lỗi "Insufficient balance in ..."
*   **Dấu hiệu**: Script bỏ qua (skip) một ngày cụ thể.
*   **Kiểm tra**: Dòng "Available leave types" trong output cho biết số giờ còn lại (đã trừ các đơn đang chờ duyệt).
*   **Nguyên nhân**: Không loại nào trong `leaveTypePriority` còn đủ số giờ.

### 3. Lỗi "Form validation failed"
*   **Dấu hiệu**: Dừng trước khi lưu, không có gì được tạo.
*   **Nguyên nhân thường gặp**:
    - `onchange warning: You were attendance from ...`: chính Bemo từ chối vì trùng giờ đã chấm công.
    - `duration is X mins, expected Y`: server tính thời lượng khác (ví dụ ngày cuối tuần tính 0 phút).
    - `leave type was reset`/`required fields empty`: form trên Bemo đã thay đổi, xem `rpc_form_view` và `rpc_create_values` trong log.

### 4. Lỗi "Safety rule violated"
*   **Dấu hiệu**: Dừng trước khi lưu. Thông báo liệt kê từng luật bị vi phạm.
*   **Cách sửa**: Thường do `action-needed.json` cũ: chạy lại `npm run data:sync`. Luật nằm ở `src/business-rules.js` và `src/timeoff/safety.js`.

### 5. "SAVED but differs from the request"
*   **Dấu hiệu**: Đơn **đã được tạo** nhưng đọc lại thấy khác (in kèm `#id`).
*   **Cách xử lý**: Mở đơn `#id` trên Bemo, sửa hoặc huỷ bằng tay. **Không tạo lại** ngày đó.

### 6. "Another time off creation is running"
*   Một lần tạo đơn khác đang chạy. Nếu chắc chắn không còn tiến trình nào, xoá `data/.create-timeoff.lock` (khoá của tiến trình đã chết sẽ tự được giải phóng).

---

## 🧪 Chạy thử không lưu

```bash
npm run off:create -- --dry-run
npm run off:fullday -- 18/09/2026 --dry-run
```

Chạy toàn bộ các bước (mở form, chọn loại phép, onchange, luật an toàn) và in giá trị sẽ gửi lên, nhưng không gọi `create`.

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
- `rpc_form_view`: form view mà dialog tạo đơn đang dùng.
- `rpc_create_start`: khung giờ (UTC) chuẩn bị tạo.
- `rpc_create_exists`: bỏ qua vì đã có đơn trùng giờ.
- `rpc_create_values`: giá trị chính xác gửi lên `create`.
- `rpc_create_saved`: đơn đã tạo (`id`) và kết quả đọc lại (`mismatches`).
- `rpc_create_failed`: lỗi của từng ngày.

## ♻️ Lưu ý về dọn dẹp Log
File JSON log sẽ tự động giữ lại **1000 dòng mới nhất** để tránh làm đầy đĩa cứng của bạn. Nếu cần bắt đầu lại từ đầu, bạn có thể xóa file trong thư mục `logs/` bất cứ lúc nào.
