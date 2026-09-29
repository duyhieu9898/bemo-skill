#!/usr/bin/env node
/**
 * Create full-day time off requests through the API engine.
 * Usage: node src/create-full-day.js DD/MM/YYYY [DD/MM/YYYY...] [--reason "..."] [--dry-run]
 */

const { createTimeOffViaApi } = require("./rpc/create-leave");

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
    console.log('Usage: node src/create-full-day.js DD/MM/YYYY [DD/MM/YYYY...] [--reason "..."] [--dry-run]');
    process.exit(1);
  }

  const records = dates.map((date) => ({ kind: "full-day", date, ...(reason ? { reason } : {}) }));
  // Full-day requests are not tracked in action-needed.json (that file is for late arrivals).
  const summary = await createTimeOffViaApi(records, { dryRun, updateActionFile: false });

  if (dryRun) {
    for (const item of summary.dryRun) {
      console.log(`\n🧪 ${item.date}: would create ${item.leaveType.name} with ${JSON.stringify(item.createValues)}`);
    }
  }
  if (summary.failed.length || summary.unverified.length) process.exit(1);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
