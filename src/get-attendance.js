#!/usr/bin/env node
/**
 * Get Attendance - Fetch attendance records from Bemo (JSON-RPC)
 * Usage: node src/get-attendance.js [--previous]
 */

const CONFIG = require("./config");
const { saveJSON, createDataWrapper, dataLogger } = require("./utils");
const { connect } = require("./rpc/client");
const { fetchAttendance } = require("./rpc/sync");

const OUTPUT_FILE = CONFIG.dataFiles.attendance;

/**
 * Fetch and save attendance records of the current (or previous) month
 * @param {Object} options - Options
 * @param {boolean} [options.previous=false] - Previous month instead of the current one
 * @returns {Promise<Array>} Records
 */
async function getAttendance({ previous = false } = {}) {
  const now = new Date();
  const records = await fetchAttendance(await connect(), {
    year: now.getFullYear(),
    monthIndex: now.getMonth() - (previous ? 1 : 0),
  });

  saveJSON(OUTPUT_FILE, createDataWrapper(records));
  dataLogger.saved(records.length, "data/attendance-data.json");

  return records;
}

if (require.main === module) {
  getAttendance({ previous: process.argv.includes("--previous") }).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = { getAttendance };
