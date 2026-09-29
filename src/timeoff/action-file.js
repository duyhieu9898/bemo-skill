/**
 * action-needed.json bookkeeping shared by the browser and API engines
 */

const CONFIG = require("../config");
const { loadRecords, saveJSON, createDataWrapper, createTimeOffLogger: log } = require("../utils");

const ACTION_FILE = CONFIG.dataFiles.actionNeeded;

/**
 * Remove handled dates from action-needed.json
 * @param {Array<string>} processedDates - Dates (DD/MM/YYYY) that no longer need time off
 */
function removeFromActionFile(processedDates) {
  const records = loadRecords(ACTION_FILE);
  const remaining = records.filter((r) => !processedDates.includes(r.date));

  saveJSON(ACTION_FILE, createDataWrapper(remaining, { count: remaining.length }));

  if (remaining.length > 0) {
    log.durationWarning(`${remaining.length} records remaining in action-needed.json`);
  }
}

module.exports = { removeFromActionFile };
