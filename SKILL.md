---
name: bemo
description: Bemo Cloud attendance and time off — checkout, sync attendance, late days, late-arrival time off, full-day leave, and the switch for scheduled automation. Use when the user mentions Bemo, chấm công, checkout, đi trễ, xin nghỉ, time-off.
---

# Bemo

Node.js scripts in `{baseDir}`. Run with `npm run <script>` from `{baseDir}`.

## Scripts

Read-only:

| Script | Does |
|---|---|
| `sync [-- --previous]` | Read attendance + time off for this (or last) month, compute late days needing time off |
| `late-days` | List late days waiting for time off (from the last sync) |
| `verify-timeoff` | Drop late days that already have time off on Bemo |
| `auto -- status` | Whether scheduled automation is on |

Writes to Bemo or changes behaviour:

| Script | Does |
|---|---|
| `checkout` | Check out now |
| `timeoff-late` / `timeoff-late -- --apply` | Dry run (sync first) / create time off for every late day listed by the dry run (refused if the list changed or the dry run is > 5 min old) |
| `leave -- DD/MM/YYYY [...] [--reason "..."] [--dry-run]` | Full-day leave, 08:00–17:00 (may split across leave types) |
| `auto -- on` / `auto -- off` | Turn scheduled automation on/off (stays until changed) |
| `cron:install` / `cron:uninstall` | Add/remove the 17:00 weekday checkout cron line |
| `login` | Log in again (headless Chrome, credentials from `.env`) |

Lines starting with "» " are the human summary (what Telegram shows); everything else is log.
Exit code 10 = skipped on purpose (auto off, nothing to create, or checkout found Bemo not checked in / already checked out).

## Rules

- Check out only when the user explicitly asks.
- `timeoff-late` and `leave`: always run the dry run first, show the result, wait for the user's yes, then run `--apply` / without `--dry-run` — with the same dates and reason.
- "SAVED but differs": the request is on Bemo; report its id, do not recreate, do not delete.
- Session expired (`BEMO_NOT_LOGGED_IN`): `checkout` logs in again by itself (it runs unattended from cron); every other script stops with this error on purpose — tell the user to run `npm run login` (Telegram: `/bemo_login`); do not guess data.
- Never print credentials, cookies or tokens from `.env` or the browser profile.
- Never run or `require()` `scripts/run-cron-telegram.js` in tests or by hand: it performs the real checkout.
- Any new scheduled job must call `readAuto()` (`src/timeoff/auto.js`) first and skip with exit 10 when off.
- Business rules (schedule, late threshold, leave type order, safety limits) live only in `src/timeoff/business-rules.js`.

## Layout

    src/commands/  one file per npm script (argv → library call → output)
    src/odoo/      JSON-RPC client, form emulation, fetch, create-leave
    src/browser/   puppeteer launch, login, checkout (Bemo signs GPS payloads, so checkout uses a browser)
    src/timeoff/   business rules, compare, sync, create, verify, safety, lock, auto switch
    src/shared/    config, logger, dates, files, errors, exit codes

Data: `data/action-needed.json` (late days), `data/attendance-data.json`, `data/timeoff-data.json`, `data/auto.json`.
Logs: `logs/bemo.log`, `logs/create-timeoff.json`, `logs/cron-run.log`, `logs/cron.log`.
