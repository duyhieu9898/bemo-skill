#!/usr/bin/env node
/**
 * Verify Time Off - Standalone script to verify existing time off requests
 * This can be used to clean up action-needed.json if requests were already created.
 */

const CONFIG = require("./config");
const { withBrowser, loadRecords, saveJSON, createDataWrapper, createTimeOffLogger: log } = require("./utils");
const { verifyTimeOffExists } = require("./create-timeoff");

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

  await withBrowser(CONFIG, headless, async (page) => {
    // We only need to navigate once to the list if we optimize verifyTimeOffExists
    // But since verifyTimeOffExists in create-timeoff.js navigates by itself,
    // we'll just use it for now, or better, implement a batch version here.

    await page.goto(CONFIG.urls.timeoffList, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for at least one data row to appear
    try {
      await page.waitForSelector(".o_data_row", { timeout: 15000 });
      // Small additional wait for all rows to settle
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.log("⚠️  Timeout waiting for data rows (.o_data_row).");
    }

    // Custom batch verification with retry logic
    let result;
    for (let i = 0; i < 3; i++) {
      result = await page.evaluate(() => {
        const rows = document.querySelectorAll(".o_data_row");
        const dates = [];
        const debugInfo = {
          rowCount: rows.length,
          url: window.location.href,
          title: document.title,
        };

        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent);
          cells.forEach((cell) => {
            const match = cell.match(/(\d{2}\/\d{2}\/\d{4})/);
            if (match) dates.push(match[1]);
          });
        });
        return { dates, debugInfo };
      });

      if (result.dates.length > 0) break;
      await new Promise(r => setTimeout(r, 2000)); // Wait and retry
    }

    const { dates: existingDates, debugInfo } = result;
    
    if (existingDates.length === 0) {
      console.log(`⚠️  No dates found in table. Rows: ${debugInfo.rowCount}, URL: ${debugInfo.url}, Title: ${debugInfo.title}`);
    } else {
      console.log(`📊 Found ${existingDates.length} date entries in ${debugInfo.rowCount} rows.`);
    }

    for (const record of records) {
      if (existingDates.includes(record.date)) {
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
