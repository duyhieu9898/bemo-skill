/**
 * Hard safety rules for creating late-arrival time off.
 * Pure functions: every engine calls them right before saving and refuses on any violation.
 */

const BUSINESS = require("../business-rules");

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DATETIME_RE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::\d{2})?$/;

/** "DD/MM/YYYY" -> "YYYY-MM-DD" or null */
function toIsoDate(date) {
  const m = typeof date === "string" && date.match(DATE_RE);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** "DD/MM/YYYY HH:MM" -> {date: "DD/MM/YYYY", minutes: minutes since midnight} or null */
function parseLocalDateTime(value) {
  const m = typeof value === "string" && value.match(DATETIME_RE);
  if (!m) return null;
  return { date: `${m[1]}/${m[2]}/${m[3]}`, minutes: Number(m[4]) * 60 + Number(m[5]) };
}

/** "HH:MM" -> minutes since midnight */
const toMinutes = (time) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/**
 * Working minutes in one day according to the schedule (lunch excluded)
 * @param {Object} schedule - BUSINESS.workSchedule
 * @returns {number}
 */
function workMinutesPerDay({ start, lunchStart, lunchEnd, end }) {
  if (!end) throw new Error("workSchedule.end must be configured");
  const lunch = lunchStart && lunchEnd ? toMinutes(lunchEnd) - toMinutes(lunchStart) : 0;
  return toMinutes(end) - toMinutes(start) - lunch;
}

/** First day of the month before `today` ("YYYY-MM-DD") */
function previousMonthStart(today) {
  const [year, month] = today.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return d.toISOString().slice(0, 10);
}

/** Local "YYYY-MM-DD" of the machine clock */
function systemToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Rules every time off request shares: valid same-day range on a working day, starting at the
 * start of work, inside the allowed date window, and not pushing the day over the working time.
 * @param {Object} request - {date, start, end} local strings
 * @param {number} countedMinutes - Minutes the request consumes (lunch excluded)
 * @param {Object} context - {today, otherMinutesThatDay}
 * @returns {{violations: Array<string>, start: Object|null, end: Object|null}}
 */
function checkCommon(request, countedMinutes, { today, otherMinutesThatDay }) {
  const { start: workStartTime, workDays } = BUSINESS.workSchedule;
  const maxMinutesPerDay = workMinutesPerDay(BUSINESS.workSchedule);
  const violations = [];

  const isoDate = toIsoDate(request.date);
  const start = parseLocalDateTime(request.start);
  const end = parseLocalDateTime(request.end);
  if (!isoDate) violations.push(`invalid date "${request.date}"`);
  if (!start || !end) violations.push(`invalid start/end "${request.start}" -> "${request.end}"`);
  if (violations.length) return { violations, start: null, end: null };

  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  if (!workDays.includes(weekday)) violations.push(`${request.date} is not a working day`);
  if (start.date !== request.date || end.date !== request.date) {
    violations.push(`start and end must both be on ${request.date}`);
  }
  if (start.minutes !== toMinutes(workStartTime)) violations.push(`time off must start at ${workStartTime}`);
  if (end.minutes <= start.minutes) violations.push("end must be after start");

  if (otherMinutesThatDay + countedMinutes > maxMinutesPerDay) {
    violations.push(
      `total time off on ${request.date} would be ${otherMinutesThatDay + countedMinutes} mins (> ${maxMinutesPerDay})`,
    );
  }

  if (isoDate > today) violations.push(`${request.date} is in the future`);
  if (isoDate < previousMonthStart(today)) violations.push(`${request.date} is older than the previous month`);

  return { violations, start, end };
}

/**
 * Check one late request before saving
 * @param {Object} request - {date: "DD/MM/YYYY", start: "DD/MM/YYYY HH:MM", end: "DD/MM/YYYY HH:MM", lateMinutes}
 * @param {Object} context - Checking context
 * @param {string} [context.today] - "YYYY-MM-DD" in the user's timezone
 * @param {number} [context.otherMinutesThatDay=0] - Active time off already on that day
 * @returns {Array<string>} Violations (empty when safe)
 */
function checkLateRequest(request, { today = systemToday(), otherMinutesThatDay = 0 } = {}) {
  const { lunchStart } = BUSINESS.workSchedule;
  const { minMinutes: minLateMinutes, maxMinutes: maxLateMinutes } = BUSINESS.lateArrival;
  const { violations, start, end } = checkCommon(request, Math.max(request.lateMinutes || 0, 0), { today, otherMinutesThatDay });
  if (!start || !end) return violations;

  if (lunchStart && end.minutes > toMinutes(lunchStart)) {
    violations.push(`late time off must end by lunch (${lunchStart})`);
  }
  const duration = end.minutes - start.minutes;
  if (duration !== request.lateMinutes) {
    violations.push(`duration ${duration} mins does not match late minutes ${request.lateMinutes}`);
  }
  if (!Number.isInteger(request.lateMinutes) || request.lateMinutes < minLateMinutes || request.lateMinutes > maxLateMinutes) {
    violations.push(`late minutes must be ${minLateMinutes}-${maxLateMinutes}, got ${request.lateMinutes}`);
  }

  return violations;
}

/**
 * Check one full-day request before saving
 * @param {Object} request - {date, start, end, minutes} where minutes is what the server will count
 * @param {Object} context - {today, otherMinutesThatDay, hasAttendance}
 * @returns {Array<string>} Violations (empty when safe)
 */
function checkFullDayRequest(request, { today = systemToday(), otherMinutesThatDay = 0, hasAttendance = false } = {}) {
  const schedule = BUSINESS.workSchedule;
  const fullDayMinutes = workMinutesPerDay(schedule);
  const { violations, start, end } = checkCommon(request, request.minutes, { today, otherMinutesThatDay });
  if (!start || !end) return violations;

  if (end.minutes !== toMinutes(schedule.end)) violations.push(`full day time off must end at ${schedule.end}`);
  if (request.minutes !== fullDayMinutes) {
    violations.push(`full day counts ${request.minutes} mins, expected ${fullDayMinutes}`);
  }
  // Attendance that day means it was (partly) worked: a full day off would contradict it.
  if (hasAttendance) violations.push(`${request.date} has attendance, a full day off would contradict it`);

  return violations;
}

/**
 * Check a whole run before touching Bemo
 * @param {Array<Object>} records - Records to create
 * @returns {Array<string>} Violations
 */
function checkRun(records) {
  const violations = [];
  if (records.length > BUSINESS.safety.maxRequestsPerRun) {
    violations.push(`${records.length} requests in one run (max ${BUSINESS.safety.maxRequestsPerRun})`);
  }
  const dates = records.map((r) => r.date);
  const duplicates = [...new Set(dates.filter((d, i) => dates.indexOf(d) !== i))];
  if (duplicates.length) violations.push(`duplicate dates: ${duplicates.join(", ")}`);
  return violations;
}

/**
 * Throw with every violation listed
 * @param {Array<string>} violations - Violations
 * @param {string} scope - What was checked
 */
function assertSafe(violations, scope) {
  if (violations.length) {
    const err = new Error(`Safety rule violated (${scope}): ${violations.join("; ")}`);
    err.code = "BEMO_SAFETY";
    throw err;
  }
}

module.exports = {
  checkLateRequest,
  checkFullDayRequest,
  checkRun,
  assertSafe,
  previousMonthStart,
  workMinutesPerDay,
};
