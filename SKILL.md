---
name: bemo-time-off-automation
description: Run Bemo Cloud attendance automation: sync attendance, find late check-ins, create/verify Time Off requests, and check in/out.
deps:
  - npm:dotenv
  - npm:puppeteer-core
---

# Bemo Time Off Automation

Use this skill for Bemo attendance, late check-ins, Time Off requests, and check-in/check-out.

Work from the skill directory:

```bash
cd {baseDir}
```

## First Action

For "check late days", "sync attendance", "compare attendance", or similar requests, run:

```bash
npm run data:sync
```

Then read `data/action-needed.json` if it exists and summarize:

- number of pending Time Off records
- affected dates
- any command error

Do not create Time Off requests in this step.

## What The Commands Do

- `npm run data:sync`: runs attendance fetch, Time Off fetch, then compare.
- `npm run auth`: refreshes the saved Bemo browser session.
- `npm run off:fast`: creates pending Time Off requests quickly.
- `npm run off:verify`: verifies created requests and cleans pending records.
- `npm run off:create`: creates with per-record verification.
- `npm run off:manual`: fills the form and lets the user click Save.

Main output files:

- `data/action-needed.json`: records that still need Time Off.
- `logs/bemo.log`: readable run log.
- `logs/create-timeoff.json`: detailed create/debug log.

## Creation Requires Approval

Only after the user explicitly approves creating Time Off requests, run:

```bash
npm run off:fast
npm run off:verify
```

Use `npm run off:create` only when the user asks for per-record verification. Use `npm run off:manual` only when the user wants to click Save manually.

## Login

Refresh login/session:

```bash
npm run auth
```

## Setup And Recovery

If Chrome is missing, ask the user to set:

```bash
PUPPETEER_EXECUTABLE_PATH=/path/to/chrome
```

If data timestamps mismatch, rerun:

```bash
npm run data:sync
```

If creation/debugging fails, inspect `logs/bemo.log` and `logs/create-timeoff.json` only after the failed command.
