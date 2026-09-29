/**
 * Hard safety rules for creating late-arrival time off.
 * Pure functions: every engine calls them right before saving and refuses on any violation.
 */

const BUSINESS = require("../business-rules");
const { bemoError } = require("../utils/errors");
const { toIsoDate, parseLocalDateTime, toMinutes, systemToday, previousMonthStart } = require("../utils/date");

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
 * @param {Array<{checkIn: string, lateMinutes: number}>} [context.attendance] - That day's attendance on Bemo (missing = violation)
 * @returns {Array<string>} Violations (empty when safe)
 */
function checkLateRequest(request, { today = systemToday(), otherMinutesThatDay = 0, attendance } = {}) {
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

  // The request must match the real first check-in of that day, not just the (possibly stale) input file.
  if (!Array.isArray(attendance)) {
    violations.push("attendance was not checked");
  } else if (attendance.length === 0) {
    violations.push(`no attendance on ${request.date}`);
  } else {
    const first = attendance[0];
    const endTime = request.end.slice(11, 16);
    if (first.checkIn !== endTime) violations.push(`first check-in is ${first.checkIn}, request ends at ${endTime}`);
    if (first.lateMinutes !== request.lateMinutes) {
      violations.push(`Bemo counts ${first.lateMinutes} late mins, request has ${request.lateMinutes}`);
    }
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
 * Check a full day split over several leave types: the parts must chain without gaps or overlaps
 * (lunch excepted) and together be exactly one full day.
 * @param {string} date - "DD/MM/YYYY"
 * @param {Array<{start: string, end: string, minutes: number}>} parts - Server-computed values, in order
 * @param {Object} context - {today, otherMinutesThatDay, hasAttendance}
 * @returns {Array<string>} Violations
 */
function checkFullDaySplit(date, parts, context = {}) {
  const { lunchStart, lunchEnd } = BUSINESS.workSchedule;
  if (parts.length < 2) return [`a split needs at least 2 parts, got ${parts.length}`];

  const total = parts.reduce((sum, p) => sum + p.minutes, 0);
  const violations = checkFullDayRequest(
    { date, start: parts[0].start, end: parts[parts.length - 1].end, minutes: total },
    context,
  );
  for (let i = 1; i < parts.length; i++) {
    const prevEnd = parts[i - 1].end.slice(11, 16);
    const start = parts[i].start.slice(11, 16);
    const acrossLunch = prevEnd === lunchStart && start === lunchEnd;
    if (prevEnd !== start && !acrossLunch) violations.push(`part ${i + 1} starts at ${start}, previous ends at ${prevEnd}`);
  }
  if (parts.some((p) => p.minutes <= 0)) violations.push("every part must count more than 0 mins");
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
    throw bemoError(`Safety rule violated (${scope}): ${violations.join("; ")}`, "BEMO_SAFETY");
  }
}

module.exports = {
  checkLateRequest,
  checkFullDayRequest,
  checkFullDaySplit,
  checkRun,
  assertSafe,
  workMinutesPerDay,
};
