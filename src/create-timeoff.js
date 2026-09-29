#!/usr/bin/env node
/**
 * Create late-arrival time off for the records in action-needed.json (API engine).
 * Usage: node src/create-timeoff.js [--dry-run]
 */

const CONFIG = require("./config");
const { loadJSON, createTimeOffLogger: log } = require("./utils");
const { createTimeOffViaApi } = require("./rpc/create-leave");

const ACTION_FILE = CONFIG.dataFiles.actionNeeded;

/**
 * Create time off requests
 * @param {Array<Object>|null} selectedRecords - Explicit approved records, or null to use action-needed.json
 * @param {Object} options - {dryRun}
 * @returns {Promise<Object>} Structured creation summary
 */
async function createTimeOff(selectedRecords = null, { dryRun = false } = {}) {
  if (selectedRecords === null) {
    const actionData = loadJSON(ACTION_FILE);
    if (!actionData) {
      log.missingFile(ACTION_FILE);
      return { created: [], unverified: [], failed: [], skipped: [], dryRun: [] };
    }
    selectedRecords = actionData.records || [];
  }
  return createTimeOffViaApi(selectedRecords, { dryRun });
}

if (require.main === module) {
  createTimeOff(null, { dryRun: process.argv.includes("--dry-run") })
    .then((summary) => {
      if (summary.failed.length || summary.unverified.length) process.exit(1);
    })
    .catch((err) => {
      console.error("❌", err.message);
      process.exit(1);
    });
}

module.exports = { createTimeOff };
