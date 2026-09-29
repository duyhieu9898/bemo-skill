---
name: Bemo Automation
description: Automate Bemo attendance checkout, late attendance data sync, time-off creation, and verification.
---

# Bemo Automation

## Khi Nào Dùng

Dùng skill này khi user muốn thao tác với Bemo Cloud, bao gồm attendance, checkout, check-in/check-out, dữ liệu đi trễ, time-off request hoặc debug automation Bemo.

## Khả Năng

- Checkout attendance trên Bemo.
- Đồng bộ dữ liệu attendance và time-off.
- So sánh dữ liệu để tìm ngày đi trễ cần tạo time-off.
- Tạo time-off request cho các record pending.
- Verify time-off request đã tạo.
- Debug log chạy Bemo automation.

## Ngữ Cảnh Quan Trọng

- Đây là project Node.js.
- Đọc dữ liệu và tạo time-off qua Odoo JSON-RPC (`src/rpc/`), dùng lại session cookie
  trong Chrome profile.
- Checkout và login vẫn dùng browser (`puppeteer-core`) vì Bemo gửi GPS/payload mã hoá khi chấm công.
- Tạo time-off qua API phát lại đúng dialog của UI (form view lấy từ calendar `form_view_id`, onchange
  theo thứ tự mở form → loại phép → `date_to` → `date_from`), bỏ qua nếu đã có đơn active trùng khung giờ,
  và đọc lại record theo id để xác minh. `npm run off:create -- --dry-run` điền + validate mà không tạo.
- Đơn "SAVED but differs" đã nằm trên Bemo: báo user kiểm tra id đó, không tạo lại, không tự xoá.
- Nghỉ cả ngày: `npm run off:fullday -- DD/MM/YYYY [--reason "..."] [--dry-run]` (08:00 → 17:00, server tính 8h).
  Bị chặn nếu ngày đó có chấm công, không phải ngày làm việc, hoặc đã có đơn trùng giờ.
- Business rules (lịch làm việc, ngưỡng đi trễ, thứ tự loại phép, giới hạn an toàn) chỉ nằm ở
  `{baseDir}/src/business-rules.js`.
- Cần Chrome/Chromium khả dụng trên máy.
- Cần session Bemo đã login; nếu hết session cần login lại.
- Một số thao tác có tác động thật lên Bemo, đặc biệt checkout và tạo time-off.
- `npm run data:sync` (`src/sync.js`) đọc chấm công + time-off qua một kết nối rồi so sánh; mặc định tháng hiện tại, thêm `-- --previous` cho tháng trước.
- Command được phép chạy do agent quản lý ở `agent/commands.json`, không nằm trong file này.

## File Liên Quan

- Package scripts: `{baseDir}/package.json`
- Bemo config: `{baseDir}/src/config.js`
- Login/session script: `{baseDir}/src/login.js`
- Check-in/out logic: `{baseDir}/src/check-in-out.js`
- Attendance sync: `{baseDir}/src/get-attendance.js`
- Time-off sync: `{baseDir}/src/get-timeoff.js`
- Compare logic: `{baseDir}/src/compare.js`
- Time-off creation: `{baseDir}/src/create-timeoff.js` (API engine: `{baseDir}/src/rpc/create-leave.js`)
- Odoo JSON-RPC client, form emulation, sync: `{baseDir}/src/rpc/`
- Time-off verification (dọn action-needed): `{baseDir}/src/verify-timeoff.js`
- Luật an toàn, chọn loại phép, khoá: `{baseDir}/src/timeoff/`
- Late-day time-off workflow wrapper: `{baseDir}/src/workflows/late-timeoff.js`
- Cron Telegram runner: `{baseDir}/scripts/run-cron-telegram.js`
- Cron setup: `{baseDir}/scripts/setup-cron.sh`

## Data Và Log

- Pending records: `{baseDir}/data/action-needed.json`
- Attendance data: `{baseDir}/data/attendance-data.json`
- Time-off data: `{baseDir}/data/timeoff-data.json`
- Human-readable log: `{baseDir}/logs/bemo.log`
- Detailed create/debug log: `{baseDir}/logs/create-timeoff.json`
- Cron runner log: `{baseDir}/logs/cron-run.log`
- Cron service log: `{baseDir}/logs/cron.log`

## Biến Môi Trường

- `PUPPETEER_EXECUTABLE_PATH`: optional path tới Chrome/Chromium nếu auto-detect không hoạt động.
- Bemo credential/session config nếu project yêu cầu trong `.env`.

## Lưu Ý An Toàn

- Checkout là thao tác thật trên Bemo.
- Tạo time-off là thao tác ghi dữ liệu thật.
- Qua Telegram, dùng `/bemo_late` để xem dữ liệu. Khi user muốn tạo time-off
  và bỏ qua một số ngày, agent phải dùng command có cấu trúc
  `bemo.prepare-timeoff` trước, rồi chỉ preview `bemo.create-timeoff`.
- Không tạo time-off nếu chưa có plan JSON do `workflows/late-timeoff.js prepare` sinh
  ra và confirmation `bemo.create-timeoff` hợp lệ.
- Không tạo hoặc verify time-off nếu user chỉ yêu cầu xem dữ liệu.
- Khi lỗi login/session, ưu tiên báo cần refresh login thay vì tự suy đoán dữ liệu sai.
- Không in credential, cookie hoặc token từ `.env`/browser profile.
