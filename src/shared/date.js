/**
 * Calendar date helpers. Dates are compared as "YYYY-MM-DD" strings, never through the machine
 * timezone, so a date means the same day everywhere.
 * Timezone conversions for Odoo datetimes live in src/rpc/datetime.js.
 */

const pad = (n) => String(n).padStart(2, "0");

/**
 * "DD/MM/YYYY" (Bemo display) or "YYYY-MM-DD" -> "YYYY-MM-DD", or null if not a real calendar date
 * @param {string} value - Date string
 * @returns {string|null}
 */
function toIsoDate(value) {
  if (typeof value !== "string") return null;
  const display = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = display ? `${display[3]}-${display[2]}-${display[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? iso : null;
}

/**
 * "YYYY-MM-DD" -> "DD/MM/YYYY"
 * @param {string} iso - ISO date
 * @returns {string}
 */
function isoToDisplay(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * "DD/MM/YYYY HH:MM[:SS]" -> {date: "DD/MM/YYYY", minutes since midnight}, or null
 * @param {string} value - Local datetime
 * @returns {{date: string, minutes: number}|null}
 */
function parseLocalDateTime(value) {
  const m = typeof value === "string" && value.match(/^(\d{2}\/\d{2}\/\d{4}) (\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m || !toIsoDate(m[1])) return null;
  return { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) };
}

/**
 * "HH:MM" -> minutes since midnight
 * @param {string} time - Time
 * @returns {number}
 */
function toMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Today on the machine clock as "YYYY-MM-DD"
 * @param {Date} now - Reference
 * @returns {string}
 */
function systemToday(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Shift a "YYYY-MM" month by n months
 * @param {string} month - "YYYY-MM"
 * @param {number} n - Months to add (may be negative)
 * @returns {string}
 */
function addMonths(month, n) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/**
 * First day of the month before `today`
 * @param {string} today - "YYYY-MM-DD"
 * @returns {string} "YYYY-MM-DD"
 */
function previousMonthStart(today) {
  return `${addMonths(today.slice(0, 7), -1)}-01`;
}

/**
 * Current and previous month as "YYYY-MM"
 * @param {string} today - "YYYY-MM-DD"
 * @returns {Array<string>}
 */
function getFilterMonths(today = systemToday()) {
  const current = today.slice(0, 7);
  return [current, addMonths(current, -1)];
}

/**
 * Whether a "DD/MM/YYYY[ HH:MM]" value falls in one of the months
 * @param {string} value - Date or datetime
 * @param {Array<string>} months - "YYYY-MM" list
 * @returns {boolean}
 */
function isInFilterMonths(value, months) {
  const iso = toIsoDate(extractDateFromDateTime(value));
  return Boolean(iso) && months.includes(iso.slice(0, 7));
}

/**
 * Get date string from datetime string
 * @param {string} dateTimeStr - DateTime string with space separator
 * @returns {string} Date part only
 */
function extractDateFromDateTime(dateTimeStr) {
  return dateTimeStr?.split(" ")[0] || "";
}

/**
 * Get time string from datetime string
 * @param {string} dateTimeStr - DateTime string with space separator
 * @returns {string} Time part only
 */
function extractTimeFromDateTime(dateTimeStr) {
  return dateTimeStr?.split(" ")[1] || "";
}

module.exports = {
  toIsoDate,
  isoToDisplay,
  parseLocalDateTime,
  toMinutes,
  systemToday,
  addMonths,
  previousMonthStart,
  getFilterMonths,
  isInFilterMonths,
  extractDateFromDateTime,
  extractTimeFromDateTime,
};
