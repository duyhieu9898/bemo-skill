/**
 * Read attendance and time off through Odoo JSON-RPC, in the same record shape the list scrapers produce.
 */

const { odooToLocalDisplay, localMonthStartToOdoo } = require("./datetime");

const pad = (n) => String(n).padStart(2, "0");

/**
 * Float hours -> "HH:MM" (Odoo float_time widget)
 * @param {number} hours - Hours
 * @returns {string}
 */
function floatToHHMM(hours) {
  const minutes = Math.round((hours || 0) * 60);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * Attendance records of the logged-in user for one local month
 * @param {Object} conn - Connection
 * @param {Object} month - {year, monthIndex} (0-based month, may overflow)
 * @returns {Promise<Array<{date, checkInDateTime, late, lateMinutes}>>}
 */
async function fetchAttendance(conn, { year, monthIndex }) {
  const rows = await conn.rpc.callKw("hr.attendance", "search_read", [], {
    domain: [
      ["employee_id.user_id", "=", conn.uid],
      ["check_in", ">=", localMonthStartToOdoo(year, monthIndex, conn.tz)],
      ["check_in", "<", localMonthStartToOdoo(year, monthIndex + 1, conn.tz)],
    ],
    fields: ["check_in", "hours_arrive_late"],
    order: "check_in desc",
    context: conn.context,
  });

  return rows.map((row) => {
    const checkInDateTime = odooToLocalDisplay(row.check_in, conn.tz);
    const late = floatToHHMM(row.hours_arrive_late);
    const [hours, minutes] = late.split(":").map(Number);
    return { date: checkInDateTime.split(" ")[0], checkInDateTime, late, lateMinutes: hours * 60 + minutes };
  });
}

/**
 * Time off requests of the logged-in user starting in [from month, to month)
 * Same domain as the "My Time Off" list: user_id = uid and request_type = request.
 * @param {Object} conn - Connection
 * @param {Object} range - {from: {year, monthIndex}, to: {year, monthIndex}} (to is exclusive)
 * @returns {Promise<Array<{type, startDate, endDate, status}>>}
 */
async function fetchTimeOff(conn, { from, to }) {
  const stateField = await conn.rpc.callKw("hr.leave", "fields_get", [["state"]], {
    attributes: ["selection"],
    context: conn.context,
  });
  const stateLabels = Object.fromEntries(stateField.state.selection);

  const rows = await conn.rpc.callKw("hr.leave", "search_read", [], {
    domain: [
      ["user_id", "=", conn.uid],
      ["request_type", "=", "request"],
      ["date_from", ">=", localMonthStartToOdoo(from.year, from.monthIndex, conn.tz)],
      ["date_from", "<", localMonthStartToOdoo(to.year, to.monthIndex, conn.tz)],
    ],
    fields: ["holiday_status_id", "date_from", "date_to", "state"],
    order: "date_from desc",
    context: conn.context,
  });

  return rows.map((row) => ({
    type: row.holiday_status_id?.[1] || "",
    startDate: odooToLocalDisplay(row.date_from, conn.tz),
    endDate: odooToLocalDisplay(row.date_to, conn.tz),
    status: stateLabels[row.state] || row.state,
  }));
}

module.exports = { fetchAttendance, fetchTimeOff, floatToHHMM };
