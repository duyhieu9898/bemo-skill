/**
 * File utilities - JSON file operations
 */

const fs = require("fs");
const path = require("path");

/**
 * Load JSON file safely
 * @param {string} filePath - Path to JSON file
 * @returns {Object|null} Parsed JSON or null if error
 */
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Save data to JSON file
 * @param {string} filePath - Path to save to
 * @param {Object} data - Data to save
 * @returns {boolean} Success status
 */
function saveJSON(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Failed to save ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Create timestamped data wrapper
 * @param {Array} records - Records to wrap
 * @param {Object} extra - Extra fields to include
 * @returns {Object} Wrapped data with timestamp
 */
function createDataWrapper(records, extra = {}) {
  return {
    timestamp: new Date().toISOString(),
    ...extra,
    records,
  };
}

/**
 * Load records from data file
 * @param {string} filePath - Path to JSON file
 * @returns {Array} Records array or empty array
 */
function loadRecords(filePath) {
  const data = loadJSON(filePath);
  return data?.records || [];
}

module.exports = {
  loadJSON,
  saveJSON,
  createDataWrapper,
  loadRecords,
};
