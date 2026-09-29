/**
 * Timezone helpers for Odoo datetimes.
 * Odoo stores datetimes as naive UTC strings ("YYYY-MM-DD HH:MM:SS"); the UI shows them in the user's tz.
 */

const pad = (n) => String(n).padStart(2, "0");

/**
 * Offset of a timezone from UTC at a given instant, in minutes
 * @param {number} utcMs - Instant
 * @param {string} timeZone - IANA timezone (e.g. "Asia/Saigon")
 * @returns {number}
 */
function tzOffsetMinutes(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * @param {string} value - Odoo UTC datetime "YYYY-MM-DD HH:MM:SS"
 * @returns {number} Epoch ms
 */
function parseOdooDatetime(value) {
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(ms)) throw new Error(`Invalid Odoo datetime: ${value}`);
  return ms;
}

/**
 * @param {number} utcMs - Epoch ms
 * @returns {string} Odoo UTC datetime "YYYY-MM-DD HH:MM:SS"
 */
function formatOdooDatetime(utcMs) {
  return new Date(utcMs).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Convert wall-clock time in a timezone to an epoch instant
 * @returns {number} Epoch ms
 */
function localToUtcMs(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - tzOffsetMinutes(guess, timeZone) * 60000;
  // Re-check once in case the offset differs at the corrected instant (DST edges).
  const offset = tzOffsetMinutes(utc, timeZone);
  utc = guess - offset * 60000;
  return utc;
}

/**
 * Odoo UTC datetime -> local display "DD/MM/YYYY HH:MM" (same as the list view)
 * @param {string} value - Odoo UTC datetime
 * @param {string} timeZone - User timezone
 * @returns {string}
 */
function odooToLocalDisplay(value, timeZone) {
  const utc = parseOdooDatetime(value);
  const d = new Date(utc + tzOffsetMinutes(utc, timeZone) * 60000);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Local display "DD/MM/YYYY HH:MM[:SS]" -> Odoo UTC datetime
 * @param {string} value - Local datetime
 * @param {string} timeZone - User timezone
 * @returns {string}
 */
function localDisplayToOdoo(value, timeZone) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) throw new Error(`Invalid local datetime: ${value}`);
  const [, day, month, year, hour, minute] = match.map(Number);
  return formatOdooDatetime(localToUtcMs(year, month, day, hour, minute, timeZone));
}

/**
 * Start of a local calendar month as an Odoo UTC datetime (month may overflow, e.g. 12 or -1)
 * @param {number} year - Full year
 * @param {number} monthIndex - 0-based month
 * @param {string} timeZone - User timezone
 * @returns {string}
 */
function localMonthStartToOdoo(year, monthIndex, timeZone) {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  return formatOdooDatetime(
    localToUtcMs(normalized.getUTCFullYear(), normalized.getUTCMonth() + 1, 1, 0, 0, timeZone),
  );
}

/**
 * Today's date in a timezone as "YYYY-MM-DD" (Odoo's context_today())
 * @param {string} timeZone - User timezone
 * @param {number} nowMs - Reference instant
 * @returns {string}
 */
function localToday(timeZone, nowMs = Date.now()) {
  return formatOdooDatetime(nowMs + tzOffsetMinutes(nowMs, timeZone) * 60000).slice(0, 10);
}

module.exports = {
  tzOffsetMinutes,
  parseOdooDatetime,
  formatOdooDatetime,
  odooToLocalDisplay,
  localDisplayToOdoo,
  localMonthStartToOdoo,
  localToday,
};
