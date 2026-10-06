# bemo

Tự động hoá chấm công và time-off trên Bemo Cloud. Hướng dẫn cho agent: `SKILL.md`. Debug: `DEBUG.md`.

## Cài đặt

    npm install
    cp .env.example .env   # BEMO_USER, BEMO_PASS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
    npm run login          # đăng nhập (Chrome headless, dùng BEMO_USER/BEMO_PASS)
    npm run cron:install   # checkout 17:00 thứ 2–6 (CRON_SCHEDULE để đổi lịch)

Nếu không tìm thấy Chrome: đặt `PUPPETEER_EXECUTABLE_PATH`.

## Lệnh

| npm run | Việc |
|---|---|
| `checkout` | Checkout ngay |
| `checkout:scheduled` | Cron gọi; bỏ qua (exit 10) khi auto tắt, hoặc khi Bemo không ở trạng thái checkout được |
| `sync [-- --previous]` | Đồng bộ chấm công + time-off, tìm ngày đi trễ |
| `late-days` | Ngày đi trễ chờ xử lý |
| `verify-timeoff` | Bỏ ngày đã có time-off khỏi danh sách |
| `timeoff-late [-- --apply]` | Chạy thử / tạo time-off cho ngày đi trễ |
| `leave -- DD/MM/YYYY [...] [--reason ".."] [--dry-run]` | Nghỉ cả ngày |
| `auto -- on\|off\|status` | Công tắc tự động (giữ tới khi đổi) |
| `cron:install` / `cron:uninstall` | Cài / gỡ cron |
| `login` | Đăng nhập lại |
| `test`, `typecheck` | Kiểm thử |

`scripts/run-cron-telegram.js` là job cron và **checkout thật** khi chạy — đừng chạy tay.

Telegram: bot ở repo cha `my-agents/bot` gọi các lệnh này (`/bemo_*`).
