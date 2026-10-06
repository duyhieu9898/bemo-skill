/**
 * Get Attendance - Fetch attendance records from Bemo (JSON-RPC)
 */

const CONFIG = require("../shared/config");
const { saveJSON, createDataWrapper, dataLogger } = require("../shared");
const { connect } = require("../odoo/client");
const { fetchAttendance } = require("../odoo/fetch");

const OUTPUT_FILE = CONFIG.dataFiles.attendance;

/**
 * Fetch and save attendance records of the current (or previous) month
 * @param {Object} options - Options
 * @param {boolean} [options.previous=false] - Previous month instead of the current one
 * @param {Object} [options.conn] - Existing connection (reused by sync)
 * @returns {Promise<Array>} Records
 */
async function getAttendance({ previous = false, conn = null } = {}) {
  const now = new Date();
  const records = await fetchAttendance(conn || (await connect()), {
    year: now.getFullYear(),
    monthIndex: now.getMonth() - (previous ? 1 : 0),
  });

  saveJSON(OUTPUT_FILE, createDataWrapper(records));
  dataLogger.saved(records.length, "data/attendance-data.json");

  return records;
}

module.exports = { getAttendance };
