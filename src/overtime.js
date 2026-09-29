#!/usr/bin/env node
/**
 * Overtime days: the automatic 17:00 checkout (checkout:auto) skips a day marked here.
 * A manual checkout (npm run checkout) is never blocked.
 * Usage: node src/overtime.js on [YYYY-MM-DD] | off [YYYY-MM-DD] | status
 */

const path = require("path");
const CONFIG = require("./config");
const { loadJSON, saveJSON, systemToday, toIsoDate } = require("./utils");

const OVERTIME_FILE = path.join(path.dirname(CONFIG.dataFiles.actionNeeded), "overtime.json");

function loadDates(file = OVERTIME_FILE) {
  return loadJSON(file)?.dates || [];
}

/**
 * Whether automatic checkout should be skipped on that day
 * @param {string} [day] - "YYYY-MM-DD", default today
 * @param {string} [file] - Storage file (tests)
 * @returns {boolean}
 */
function isOvertime(day = systemToday(), file = OVERTIME_FILE) {
  return loadDates(file).includes(day);
}

/**
 * Mark or unmark a day; past days are dropped so the file stays small
 * @param {boolean} on - Mark (true) or unmark (false)
 * @param {string} [day] - "YYYY-MM-DD", default today
 * @param {string} [file] - Storage file (tests)
 * @returns {Array<string>} Marked days from today on
 */
function setOvertime(on, day = systemToday(), file = OVERTIME_FILE) {
  if (!toIsoDate(day) || toIsoDate(day) !== day) throw new Error(`Invalid date: ${day} (use YYYY-MM-DD)`);
  const today = systemToday();
  const dates = new Set(loadDates(file).filter((d) => d >= today));
  if (on) dates.add(day);
  else dates.delete(day);
  const sorted = [...dates].sort();
  saveJSON(file, { dates: sorted });
  return sorted;
}

if (require.main === module) {
  const [command = "status", day] = process.argv.slice(2);
  try {
    if (command === "on" || command === "off") {
      const dates = setOvertime(command === "on", day);
      const target = day || systemToday();
      console.log(
        command === "on"
          ? `🕔 ${target}: automatic checkout will be skipped. Check out yourself with: npm run checkout`
          : `✅ ${target}: automatic checkout re-enabled`,
      );
      console.log(`Overtime days: ${dates.join(", ") || "none"}`);
    } else if (command === "status") {
      const dates = loadDates().filter((d) => d >= systemToday());
      console.log(`Overtime days: ${dates.join(", ") || "none"}`);
    } else {
      throw new Error("Usage: node src/overtime.js on [YYYY-MM-DD] | off [YYYY-MM-DD] | status");
    }
  } catch (err) {
    console.error("❌", err.message);
    process.exit(1);
  }
}

module.exports = { isOvertime, setOvertime, OVERTIME_FILE };
