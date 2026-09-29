#!/usr/bin/env node
/**
 * Verify Time Off - Standalone script to verify existing time off requests
 * This can be used to clean up action-needed.json if requests were already created.
 */

const CONFIG = require("./config");
const BUSINESS = require("./business-rules");
const { withBrowser, navigateWithAuth, loadRecords, saveJSON, createDataWrapper, parseDate } = require("./utils");
const { collectTimeOffRows, parseTimeOffRow } = require("./get-timeoff");

const ACTION_FILE = CONFIG.dataFiles.actionNeeded;

async function verifyAll(headless = true) {
  const records = loadRecords(ACTION_FILE);

  if (records.length === 0) {
    console.log("No records in action-needed.json to verify.");
    return;
  }

  console.log(`🔍 Verifying ${records.length} records against Bemo list...`);

  const verifiedDates = [];
  const missingDates = [];
  const oldestRecordDate = new Date(Math.min(...records.map((r) => parseDate(r.date)?.getTime() ?? Date.now())));

  await withBrowser(CONFIG, headless, async (page) => {
    await navigateWithAuth(page, CONFIG.urls.timeoffList, { waitForList: true });

    const rows = await collectTimeOffRows(page, oldestRecordDate);
    // Late time off always starts at workStartTime; match it so another request on the same day doesn't count.
    const existingStarts = new Set(rows.map((cells) => parseTimeOffRow(cells).startDate));
    console.log(`📊 Read ${rows.length} time off rows.`);

    for (const record of records) {
      if (existingStarts.has(`${record.date} ${BUSINESS.workSchedule.start}`)) {
        verifiedDates.push(record.date);
      } else {
        missingDates.push(record.date);
      }
    }
  });

  if (verifiedDates.length > 0) {
    console.log(`✅ Verified ${verifiedDates.length} records already exist.`);
    // Update action-needed.json
    const remaining = records.filter((r) => !verifiedDates.includes(r.date));
    const data = createDataWrapper(remaining, { count: remaining.length });
    saveJSON(ACTION_FILE, data);
    console.log(`♻️  Removed ${verifiedDates.length} verified records from action-needed.json`);
  }

  if (missingDates.length > 0) {
    console.log(`❌ ${missingDates.length} records still missing in Bemo.`);
  }
}

if (require.main === module) {
  const show = process.argv.includes("--show");
  verifyAll(!show).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = { verifyAll };
