#!/usr/bin/env node
/**
 * Get Time Off - Fetch time off records from Bemo
 */

const CONFIG = require("./config");
const BUSINESS = require("./business-rules");
const {
  withBrowser,
  navigateWithAuth,
  withListReload,
  saveJSON,
  createDataWrapper,
  parseDate,
  getFilterMonths,
  isInFilterMonths,
  dataLogger,
} = require("./utils");
const { connect } = require("./rpc/client");
const { fetchTimeOff } = require("./rpc/sync");

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
  const { start: workStartTime } = BUSINESS.workSchedule;
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
 * Read the Odoo pager ("1-80" of "529")
 * @param {Page} page - Puppeteer page
 * @returns {Promise<{end: number, total: number}|null>} Null when there is no pager
 */
async function readPager(page) {
  return page.evaluate(() => {
    const value = document.querySelector(".o_pager_value")?.textContent.trim() || "";
    const total = parseInt(document.querySelector(".o_pager_limit")?.textContent.trim() || "", 10);
    const end = parseInt(value.split("-").pop(), 10);
    return Number.isFinite(end) && Number.isFinite(total) ? { end, total } : null;
  });
}

/**
 * First day of the previous month: the oldest date either filter mode needs.
 * @param {Date} now - Reference date
 * @returns {Date}
 */
function getOldestNeededDate(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/**
 * Collect time off rows across list pages.
 * The list is sorted by start date (newest first), so paging stops once a page reaches older than `cutoff`.
 * @param {Page} page - Puppeteer page already on the time off list
 * @param {Date} cutoff - Stop after the page whose oldest row starts before this date
 * @param {number} maxPages - Safety cap
 * @returns {Promise<Array<Array<string>>>} Raw rows
 */
async function collectTimeOffRows(page, cutoff = getOldestNeededDate(), maxPages = 20) {
  const rows = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const pageRows = await extractTimeOffRecords(page);
    rows.push(...pageRows);

    const oldest = pageRows.length ? parseDate(pageRows.at(-1)[START_COL] || "") : null;
    const pager = await readPager(page);
    const hasNext = pager && pager.end < pager.total;
    if (!hasNext || (oldest && oldest < cutoff)) break;

    await withListReload(page, () => page.click(".o_pager_next"));
  }

  return rows;
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
 * Read time off by scraping the list view (fallback engine)
 */
async function readTimeOffFromBrowser(headless) {
  return withBrowser(CONFIG, headless, async (page) => {
    await navigateWithAuth(page, CONFIG.urls.timeoffList, { waitForList: true });
    const rawData = await collectTimeOffRows(page);
    return rawData.map(parseTimeOffRow);
  });
}

/**
 * Read time off through Odoo JSON-RPC (default engine): previous + current month, the widest filter needs
 */
async function readTimeOffFromApi() {
  const now = new Date();
  const conn = await connect();
  return fetchTimeOff(conn, {
    from: { year: now.getFullYear(), monthIndex: now.getMonth() - 1 },
    to: { year: now.getFullYear(), monthIndex: now.getMonth() + 1 },
  });
}

/**
 * Main function to get time off records
 * @param {boolean} headless - Run in headless mode (browser engine only)
 * @param {string|function} filterMode - Filter mode or filter function
 * @param {Object} options - Options
 * @param {"api"|"browser"} [options.engine="api"] - Data source
 * @returns {Promise<Array>} Processed records
 */
async function getTimeOff(headless = true, filterMode = "current", { engine = "api" } = {}) {
  const filterRecords =
    typeof filterMode === "function"
      ? filterMode
      : TIMEOFF_FILTERS[filterMode] || filterByCurrentMonths;

  const records = engine === "browser" ? await readTimeOffFromBrowser(headless) : await readTimeOffFromApi();

  // Filter by selected month mode and add isLate flag
  const filtered = filterRecords(records).map((record) => ({
    ...record,
    isLate: isLateTimeOff(record),
  }));

  saveJSON(OUTPUT_FILE, createDataWrapper(filtered));
  dataLogger.saved(filtered.length, "data/timeoff-data.json");

  return filtered;
}

// CLI entry point
if (require.main === module) {
  const headless = !process.argv.includes("--show");
  const filterMode = process.argv.includes("--previous") ? "previous" : "current";

  const engine = process.argv.includes("--browser") ? "browser" : "api";

  getTimeOff(headless, filterMode, { engine }).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = {
  getTimeOff,
  collectTimeOffRows,
  parseTimeOffRow,
  filterByCurrentMonths,
  filterByPreviousMonths,
};
