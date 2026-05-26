#!/usr/bin/env node
/**
 * Get Attendance - Fetch attendance records from Bemo
 */

const CONFIG = require("./config");
const {
  withBrowser,
  navigateWithAuth,
  saveJSON,
  createDataWrapper,
  parseTimeToMinutes,
  extractDateFromDateTime,
  dataLogger,
} = require("./utils");

const OUTPUT_FILE = CONFIG.dataFiles.attendance;
const { checkIn: CHECK_IN_COL, late: LATE_COL } = CONFIG.columns.attendance;

/**
 * Parse attendance row cells to record
 * @param {Array<string>} cells - Table row cells
 * @returns {Object|null} Attendance record or null if invalid
 */
function parseAttendanceRow(cells) {
  const checkIn = cells[CHECK_IN_COL] || "";
  const late = cells[LATE_COL] || "";

  // Validate check-in date format
  if (!checkIn || !checkIn.match(/\d{2}\/\d{2}\/\d{4}/)) {
    return null;
  }

  return {
    date: extractDateFromDateTime(checkIn),
    checkInDateTime: checkIn,
    late,
    lateMinutes: parseTimeToMinutes(late),
  };
}

/**
 * Extract attendance records from page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Attendance records
 */
async function extractAttendanceRecords(page) {
  const rawData = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tbody tr.o_data_row");
    return Array.from(rows).map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((c) =>
        c.textContent.trim()
      );
      return cells;
    });
  });

  return rawData.map(parseAttendanceRow).filter(Boolean);
}

/**
 * Main function to get attendance records
 * @param {boolean} headless - Run in headless mode
 * @returns {Promise<Array>} Processed records
 */
async function getAttendance(headless = true) {
  return withBrowser(CONFIG, headless, async (page) => {
    await navigateWithAuth(page, CONFIG.urls.attendances);

    const records = await extractAttendanceRecords(page);

    const data = createDataWrapper(records);
    saveJSON(OUTPUT_FILE, data);

    dataLogger.saved(records.length, "data/attendance-data.json");

    return records;
  });
}

// CLI entry point
if (require.main === module) {
  const headless = !process.argv.includes("--show");
  
  getAttendance(headless).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = { getAttendance };
