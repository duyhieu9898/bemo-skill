#!/usr/bin/env node
/**
 * Get Time Off - Fetch time off records from Bemo (JSON-RPC)
 * Usage: node src/get-timeoff.js [--previous]
 */

const CONFIG = require("./config");
const BUSINESS = require("./business-rules");
const { saveJSON, createDataWrapper, parseDate, getFilterMonths, isInFilterMonths, dataLogger } = require("./utils");
const { connect } = require("./rpc/client");
const { fetchTimeOff } = require("./rpc/sync");

const OUTPUT_FILE = CONFIG.dataFiles.timeoff;
const TIMEOFF_FILTERS = {
  current: filterByCurrentMonths,
  previous: filterByPreviousMonths,
};

/**
 * Check if record is a late time off (starts at the start of work, ends within that hour)
 * @param {Object} record - Time off record
 * @returns {boolean}
 */
function isLateTimeOff(record) {
  const { start: workStartTime } = BUSINESS.workSchedule;
  const startHour = workStartTime.split(":")[0];
  const endTimePattern = new RegExp(`${startHour}:\\d{2}`);

  return record.startDate?.includes(workStartTime) && Boolean(record.endDate?.match(endTimePattern));
}

/**
 * Filter records to current and previous month
 * @param {Array} records - All records
 * @returns {Array} Filtered records
 */
function filterByCurrentMonths(records) {
  const filters = getFilterMonths();
  return records.filter((record) => isInFilterMonths(parseDate(record.startDate), filters));
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
  const filters = [{ month: currMonth === 0 ? 11 : currMonth - 1, year: currMonth === 0 ? currYear - 1 : currYear }];
  return records.filter((record) => isInFilterMonths(parseDate(record.startDate), filters));
}

/**
 * Fetch, filter and save time off records
 * @param {string|function} filterMode - "current" (current + previous month), "previous", or a filter function
 * @returns {Promise<Array>} Processed records
 */
async function getTimeOff(filterMode = "current") {
  const filterRecords =
    typeof filterMode === "function" ? filterMode : TIMEOFF_FILTERS[filterMode] || filterByCurrentMonths;

  // Previous + current month: the widest range either filter needs.
  const now = new Date();
  const records = await fetchTimeOff(await connect(), {
    from: { year: now.getFullYear(), monthIndex: now.getMonth() - 1 },
    to: { year: now.getFullYear(), monthIndex: now.getMonth() + 1 },
  });

  const filtered = filterRecords(records).map((record) => ({ ...record, isLate: isLateTimeOff(record) }));

  saveJSON(OUTPUT_FILE, createDataWrapper(filtered));
  dataLogger.saved(filtered.length, "data/timeoff-data.json");

  return filtered;
}

if (require.main === module) {
  getTimeOff(process.argv.includes("--previous") ? "previous" : "current").catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = {
  getTimeOff,
  filterByCurrentMonths,
  filterByPreviousMonths,
};
