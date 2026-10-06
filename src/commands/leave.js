#!/usr/bin/env node
/**
 * Full-day leave.
 * Usage: node src/commands/leave.js DD/MM/YYYY [DD/MM/YYYY...] [--reason "..."] [--dry-run]
 */

const { createTimeOffViaApi } = require("../odoo/create-leave");
const { formatDryRun, summaryExitCode } = require("../timeoff/create");

function parseArgs(argv) {
  const dates = [];
  let reason;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--reason") reason = argv[++i];
    else dates.push(argv[i]);
  }
  return { dates, reason, dryRun };
}

async function main() {
  const { dates, reason, dryRun } = parseArgs(process.argv.slice(2));
  if (!dates.length) {
    console.log('Usage: node src/commands/leave.js DD/MM/YYYY [DD/MM/YYYY...] [--reason "..."] [--dry-run]');
    process.exit(1);
  }
  const records = dates.map((date) => ({ kind: "full-day", date, ...(reason ? { reason } : {}) }));
  // Full-day requests are not tracked in action-needed.json (that file is for late arrivals).
  const summary = await createTimeOffViaApi(records, { dryRun, updateActionFile: false });
  if (dryRun) console.log(`\n${formatDryRun(summary)}`);
  process.exitCode = summaryExitCode(summary, { dryRun });
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
