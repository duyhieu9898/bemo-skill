#!/usr/bin/env node
/**
 * Get Time Off - Fetch time off records from Bemo
 */

const CONFIG = require("./config");
const {
  withBrowser,
  navigateWithAuth,
  saveJSON,
  createDataWrapper,
  parseDate,
  getFilterMonths,
  isInFilterMonths,
  dataLogger,
} = require("./utils");

const OUTPUT_FILE = CONFIG.dataFiles.timeoff;
const { type: TYPE_COL, startDate: START_COL, endDate: END_COL, status: STATUS_COL } = CONFIG.columns.timeoff;
const TIMEOFF_FILTERS = {
  current: filterByCurrentMonths,
  previous: filterByPreviousMonths,
};

/**
 * Parse time off row cells to record
 * @param {Array<string>} cells - Table row cells
 * @returns {Object} Time off record
 */
function parseTimeOffRow(cells) {
  return {
    type: cells[TYPE_COL] || "",
    startDate: cells[START_COL] || "",
    endDate: cells[END_COL] || "",
    status: cells[STATUS_COL] || "",
  };
}

/**
 * Check if record is a late time off
 * Uses workStartTime from config instead of hardcoded value
 * @param {Object} record - Time off record
 * @returns {boolean}
 */
function isLateTimeOff(record) {
  const { workStartTime } = CONFIG.rules;
  // Extract hour from workStartTime (e.g., "08:00" -> "08")
  const startHour = workStartTime.split(":")[0];
  const endTimePattern = new RegExp(`${startHour}:\\d{2}`);
  
  return (
    record.startDate?.includes(workStartTime) &&
    Boolean(record.endDate?.match(endTimePattern))
  );
}

/**
 * Extract time off records from page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Raw time off data
 */
async function extractTimeOffRecords(page) {
  return page.evaluate(() => {
    const rows = document.querySelectorAll("table tbody tr.o_data_row");
    return Array.from(rows).map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent.trim());
      return cells;
    });
  });
}

/**
 * Filter records to current and previous month
 * @param {Array} records - All records
 * @returns {Array} Filtered records
 */
function filterByCurrentMonths(records) {
  const filters = getFilterMonths();

  return records.filter((record) => {
    const date = parseDate(record.startDate);
    return isInFilterMonths(date, filters);
  });
}

/**
 * Filter records to previous month only
 * @param {Array} records - All records
 * @returns {Array} Filtered records
 */
function filterByPreviousMonths(records) {
  const now = new Date();
  const currMonth = now.getMonth();
  const currYear = now.getFullYear();
  const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
  const prevYear = currMonth === 0 ? currYear - 1 : currYear;
  const filters = [{ month: prevMonth, year: prevYear }];

  return records.filter((record) => {
    const date = parseDate(record.startDate);
    return isInFilterMonths(date, filters);
  });
}

/**
 * Main function to get time off records
 * @param {boolean} headless - Run in headless mode
 * @param {string|function} filterMode - Filter mode or filter function
 * @returns {Promise<Array>} Processed records
 */
async function getTimeOff(headless = true, filterMode = "current") {
  const filterRecords =
    typeof filterMode === "function"
      ? filterMode
      : TIMEOFF_FILTERS[filterMode] || filterByCurrentMonths;

  return withBrowser(CONFIG, headless, async (page) => {
    await navigateWithAuth(page, CONFIG.urls.timeoffList, { waitTime: 5000 });

    const rawData = await extractTimeOffRecords(page);
    const records = rawData.map(parseTimeOffRow);

    // Filter by selected month mode and add isLate flag
    const filtered = filterRecords(records).map((record) => ({
      ...record,
      isLate: isLateTimeOff(record),
    }));

    const data = createDataWrapper(filtered);
    saveJSON(OUTPUT_FILE, data);

    dataLogger.saved(filtered.length, "data/timeoff-data.json");

    return filtered;
  });
}

// CLI entry point
if (require.main === module) {
  const headless = !process.argv.includes("--show");
  const filterMode = process.argv.includes("--previous") ? "previous" : "current";

  getTimeOff(headless, filterMode).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = {
  getTimeOff,
  filterByCurrentMonths,
  filterByPreviousMonths,
};
