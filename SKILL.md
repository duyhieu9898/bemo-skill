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
- Browser automation dùng `puppeteer-core`.
- Cần Chrome/Chromium khả dụng trên máy.
- Cần session Bemo đã login; nếu hết session cần login lại.
- Một số thao tác có tác động thật lên Bemo, đặc biệt checkout và tạo time-off.
- Khi đồng bộ dữ liệu (`get-attendance.js` và `get-timeoff.js`), mặc định sẽ lấy dữ liệu của tháng hiện tại. Sử dụng tham số `--previous` nếu cần đồng bộ dữ liệu của tháng trước.
- Command được phép chạy do agent quản lý ở `agent/commands.json`, không nằm trong file này.

## File Liên Quan

- Package scripts: `{baseDir}/package.json`
- Bemo config: `{baseDir}/src/config.js`
- Login/session script: `{baseDir}/src/login.js`
- Check-in/out logic: `{baseDir}/src/check-in-out.js`
- Attendance sync: `{baseDir}/src/get-attendance.js`
- Time-off sync: `{baseDir}/src/get-timeoff.js`
- Compare logic: `{baseDir}/src/compare.js`
- Time-off creation: `{baseDir}/src/create-timeoff.js`
- Time-off verification: `{baseDir}/src/verify-timeoff.js`
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
- Không tạo hoặc verify time-off nếu user chỉ yêu cầu xem dữ liệu.
- Khi lỗi login/session, ưu tiên báo cần refresh login thay vì tự suy đoán dữ liệu sai.
- Không in credential, cookie hoặc token từ `.env`/browser profile.
