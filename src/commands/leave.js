#!/usr/bin/env node
/**
 * Create full-day time off requests through the API engine.
 * Usage: node src/create-full-day.js DD/MM/YYYY [DD/MM/YYYY...] [--reason "..."] [--dry-run]
 *        node src/create-full-day.js --stdin [--dry-run]   (JSON {"dates": ["YYYY-MM-DD"], "reason"?: "..."}, agent commands)
 */

const { createTimeOffViaApi } = require("../odoo/create-leave");
const { toIsoDate, isoToDisplay } = require("../shared");

/**
 * Parse the agent's structured input
 * @param {string} text - JSON
 * @returns {{dates: Array<string>, reason: string|undefined}} dates as DD/MM/YYYY
 */
function parseStdinInput(text) {
  const input = JSON.parse(text);
  if (!input || !Array.isArray(input.dates) || input.dates.length === 0) throw new Error("Input needs a non-empty dates array");
  const dates = input.dates.map((value) => {
    const iso = toIsoDate(value);
    if (!iso || iso !== value) throw new Error(`Invalid date: ${value} (use YYYY-MM-DD)`);
    return isoToDisplay(iso);
  });
  if (input.reason !== undefined && (typeof input.reason !== "string" || !input.reason.trim())) {
    throw new Error("reason must be a non-empty string");
  }
  return { dates, reason: input.reason?.trim() };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function parseArgs(argv) {
  const dates = [];
  let reason;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--stdin") continue;
    else if (argv[i] === "--reason") reason = argv[++i];
    else dates.push(argv[i]);
  }
  return { dates, reason, dryRun };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dryRun } = args;
  const { dates, reason } = process.argv.includes("--stdin") ? parseStdinInput(await readStdin()) : args;
  if (!dates.length) {
    console.log('Usage: node src/create-full-day.js DD/MM/YYYY [DD/MM/YYYY...] [--reason "..."] [--dry-run]');
    process.exit(1);
  }

  const records = dates.map((date) => ({ kind: "full-day", date, ...(reason ? { reason } : {}) }));
  // Full-day requests are not tracked in action-needed.json (that file is for late arrivals).
  const summary = await createTimeOffViaApi(records, { dryRun, updateActionFile: false });

  if (dryRun) {
    for (const item of summary.dryRun) {
      for (const part of item.parts) {
        console.log(`\n🧪 ${item.date}: would create ${part.leaveType} (${part.minutes} mins) with ${JSON.stringify(part.createValues)}`);
      }
    }
  }
  if (summary.failed.length || summary.unverified.length) process.exit(1);
}

module.exports = { parseStdinInput };

if (require.main === module) {
  main().catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}
