#!/usr/bin/env node
/**
 * Compare Attendance vs Time Off - Find missing time off requests
 */

const CONFIG = require("./config");
const { loadJSON, saveJSON, createDataWrapper, extractDateFromDateTime, compareLogger: log } = require("./utils");

const { attendance, timeoff, actionNeeded } = CONFIG.dataFiles;
const { minLateMinutes, maxLateMinutes, defaultReason } = CONFIG.rules;

/**
 * Check if two timestamps are from the same hour
 * Compares year, month, day, and hour
 * @param {string} timestamp1 - ISO timestamp string
 * @param {string} timestamp2 - ISO timestamp string
 * @returns {boolean} True if same hour
 */
function isSameHour(timestamp1, timestamp2) {
  const d1 = new Date(timestamp1);
  const d2 = new Date(timestamp2);

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate() &&
    d1.getHours() === d2.getHours()
  );
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted string
 */
function formatTimestamp(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Check if data files have matching timestamps
 * @param {Object} attData - Attendance data
 * @param {Object} toData - Time off data
 * @throws {Error} If timestamps don't match
 */
function validateDataFreshness(attData, toData) {
  const attTs = attData.timestamp;
  const toTs = toData.timestamp;

  if (!attTs || !toTs) {
    log.timestampWarning();
    return;
  }

  const attFormatted = formatTimestamp(attTs);
  const toFormatted = formatTimestamp(toTs);
  const match = isSameHour(attTs, toTs);

  log.timestampCheck(attFormatted, toFormatted, match);

  if (!match) {
    throw new Error(`Data timestamp mismatch: Attendance (${attFormatted}) vs TimeOff (${toFormatted})`);
  }
}

/**
 * Check if late minutes requires time off
 * @param {number} minutes - Late minutes
 * @returns {boolean}
 */
function needsTimeOff(minutes) {
  return minutes >= minLateMinutes && minutes <= maxLateMinutes;
}

/**
 * Get set of dates that have time off requests
 * @param {Array} records - Time off records
 * @returns {Set<string>}
 */
function getTimeOffDates(records) {
  return new Set(records.map((r) => extractDateFromDateTime(r.startDate)));
}

/**
 * Categorize attendance records
 * @param {Array} attendanceRecords - Attendance records
 * @param {Set<string>} existingDates - Dates with existing time off
 * @returns {Object} Categorized records
 */
function categorizeRecords(attendanceRecords, existingDates) {
  const result = {
    needsAction: [],
    existing: [],
    skipped: [],
  };

  for (const record of attendanceRecords) {
    if (!needsTimeOff(record.lateMinutes)) {
      result.skipped.push(record);
      continue;
    }

    if (existingDates.has(record.date)) {
      result.existing.push(record);
    } else {
      result.needsAction.push(record);
    }
  }

  return result;
}

/**
 * Print comparison results
 * @param {Object} categories - Categorized records
 */
function printResults({ needsAction, existing, skipped }) {
  log.header();
  log.summary(existing.length, needsAction.length, skipped.length);

  if (needsAction.length > 0) {
    log.needsCreate(needsAction);
  }
}

/**
 * Add default reason to records
 * @param {Array} records - Records to process
 * @returns {Array} Records with reason added
 */
function addReasonToRecords(records) {
  return records.map((r) => ({
    ...r,
    reason: defaultReason,
  }));
}

/**
 * Main compare function
 * @param {Object} options - Options
 * @param {boolean} options.skipTimestampCheck - Skip timestamp validation
 * @returns {Object} Comparison results
 */
function compare(options = {}) {
  const attData = loadJSON(attendance);
  const toData = loadJSON(timeoff);

  if (!attData) {
    throw new Error("Run: node get-attendance.js");
  }
  if (!toData) {
    throw new Error("Run: node get-timeoff.js");
  }

  // Validate data freshness (same hour)
  if (!options.skipTimestampCheck) {
    validateDataFreshness(attData, toData);
  }

  const existingDates = getTimeOffDates(toData.records);
  const categories = categorizeRecords(attData.records, existingDates);

  printResults(categories);

  // Save action needed records
  // Save action needed records (always save, even if empty)
  const recordsWithReason = addReasonToRecords(categories.needsAction);
  const data = createDataWrapper(recordsWithReason, {
    count: recordsWithReason.length,
  });

  saveJSON(actionNeeded, data);
  if (recordsWithReason.length > 0) {
    log.saved("data/action-needed.json");
  }

  return categories;
}

// CLI entry point
if (require.main === module) {
  const skipCheck = process.argv.includes("--skip-check");

  try {
    compare({ skipTimestampCheck: skipCheck });
  } catch (err) {
    console.error("❌", err.message);
    process.exit(1);
  }
}

module.exports = { compare, needsTimeOff };
