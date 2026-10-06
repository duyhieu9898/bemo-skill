/**
 * Auto switch: one persistent on/off for everything bemo runs on a schedule (today: the 17:00 checkout).
 * Off stays off until turned on again. Every scheduled job must check readAuto() first.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../shared/config");
const { loadJSON, saveJSON, systemToday, isoToDisplay } = require("../shared");

const DATA_DIR = path.dirname(CONFIG.dataFiles.actionNeeded);
const AUTO_FILE = path.join(DATA_DIR, "auto.json");
const LEGACY_FILE = path.join(DATA_DIR, "overtime.json");

/**
 * @typedef {{enabled: boolean, changedAt: string|null}} AutoState
 * @typedef {{file?: string, legacyFile?: string, today?: string}} AutoOptions
 */

/**
 * Current state; migrates the old per-day overtime.json once
 * @param {AutoOptions} [options]
 * @returns {AutoState}
 */
function readAuto({ file = AUTO_FILE, legacyFile = LEGACY_FILE, today = systemToday() } = {}) {
  const state = loadJSON(file);
  if (state && typeof state.enabled === "boolean") return { enabled: state.enabled, changedAt: state.changedAt ?? null };
  if (fs.existsSync(legacyFile)) {
    const dates = loadJSON(legacyFile)?.dates || [];
    const migrated = { enabled: !dates.includes(today), changedAt: today };
    saveJSON(file, migrated);
    fs.rmSync(legacyFile);
    return migrated;
  }
  return { enabled: true, changedAt: null };
}

/**
 * Turn the switch on/off; keeps the original date when the state does not change
 * @param {boolean} enabled
 * @param {AutoOptions} [options]
 * @returns {AutoState}
 */
function setAuto(enabled, options = {}) {
  const today = options.today || systemToday();
  const current = readAuto({ ...options, today });
  if (current.enabled === enabled && current.changedAt) return current;
  const next = { enabled, changedAt: today };
  saveJSON(options.file || AUTO_FILE, next);
  return next;
}

/**
 * One-line human description
 * @param {AutoState} state
 * @param {string} [today] - "YYYY-MM-DD"
 * @returns {string}
 */
function describeAuto(state, today = systemToday()) {
  if (state.enabled) return "Tự động: BẬT — checkout 17:00 sẽ chạy.";
  const since = state.changedAt
    ? ` từ ${isoToDisplay(state.changedAt)} (${Math.round((Date.parse(today) - Date.parse(state.changedAt)) / 86400000) + 1} ngày)`
    : "";
  return `Tự động: TẮT${since} — checkout 17:00 không chạy. /bemo_auto_on để bật lại.`;
}

module.exports = { readAuto, setAuto, describeAuto, AUTO_FILE };
