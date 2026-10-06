#!/usr/bin/env node
/**
 * Time off for late days.
 * Usage: node src/commands/timeoff-late.js          sync, then dry run (exit 10 when nothing to create)
 *        node src/commands/timeoff-late.js --apply  create exactly what the last dry run listed (no new sync)
 */
const { sync } = require("../timeoff/sync");
const { createTimeOff, formatDryRun, summaryExitCode } = require("../timeoff/create");

async function main(argv) {
  const dryRun = !argv.includes("--apply");
  if (dryRun) await sync();
  const summary = await createTimeOff(null, { dryRun });
  if (dryRun) console.log(`\n${formatDryRun(summary)}`);
  process.exitCode = summaryExitCode(summary, { dryRun });
}

main(process.argv.slice(2)).catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
