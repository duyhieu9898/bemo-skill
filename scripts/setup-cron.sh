#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$PROJECT_DIR/scripts/run-cron-telegram.js"
CRON_MARKER="bemo-automation-checkout"
CRON_SCHEDULE="${CRON_SCHEDULE:-0 17 * * 1-5}"
CRON_LOG="$PROJECT_DIR/logs/cron.log"

mkdir -p "$PROJECT_DIR/logs"
chmod +x "$RUNNER"

if ! command -v crontab >/dev/null 2>&1; then
  printf 'crontab command not found. Install cron first: sudo apt install cron\n' >&2
  exit 1
fi

CRON_LINE="${CRON_SCHEDULE} cd \"$PROJECT_DIR\" && P=\$(printf '\\045') && node \"$RUNNER\" 2>&1 | awk -v p=\"\$P\" '{ print \"[\" strftime(p \"Y-\" p \"m-\" p \"d \" p \"H:\" p \"M:\" p \"S\") \"] \" \$0; fflush(); }' >> \"$CRON_LOG\" # ${CRON_MARKER}"
CURRENT_CRON="$(mktemp)"
NEW_CRON="$(mktemp)"

crontab -l >"$CURRENT_CRON" 2>/dev/null || true
grep -v "# ${CRON_MARKER}$" "$CURRENT_CRON" >"$NEW_CRON" || true
printf '%s\n' "$CRON_LINE" >>"$NEW_CRON"
crontab "$NEW_CRON"

rm -f "$CURRENT_CRON" "$NEW_CRON"

printf 'Installed cron job:\n%s\n' "$CRON_LINE"
printf '\nIt will run at 17:00, Monday through Friday, using the server timezone.\n'
printf 'Runner: %s\n' "$RUNNER"
printf 'Cron log: %s\n' "$CRON_LOG"
