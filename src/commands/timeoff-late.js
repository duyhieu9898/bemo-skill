#!/usr/bin/env node
/**
 * Time off for late days.
 * Usage: node src/commands/timeoff-late.js          sync, then dry run (exit 10 when nothing to create)
 *        node src/commands/timeoff-late.js --apply  create exactly what the last dry run listed: refused when
 *                                                   the late list changed since, or the dry run is > 5 min old
 */
const CONFIG = require("../shared/config");
const { loadJSON } = require("../shared");
const { sync } = require("../timeoff/sync");
const { createTimeOff, formatDryRun, summaryExitCode } = require("../timeoff/create");
const { savePreview, takePreview } = require("../timeoff/late-preview");

const readActionData = () => loadJSON(CONFIG.dataFiles.actionNeeded);

async function main(argv) {
  const dryRun = !argv.includes("--apply");
  if (dryRun) await sync();
  else takePreview(readActionData());
  const summary = await createTimeOff(null, { dryRun });
  if (dryRun) {
    savePreview(readActionData());
    console.log(`\n${formatDryRun(summary)}`);
  }
  process.exitCode = summaryExitCode(summary, { dryRun });
}

main(process.argv.slice(2)).catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
