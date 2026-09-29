/**
 * Create late-arrival time off through Odoo JSON-RPC, replaying the web client's dialog:
 * open form -> pick leave type -> set end -> set start -> description -> create -> read back.
 */

const CONFIG = require("../config");
const BUSINESS = require("../business-rules");
const { extractTimeFromDateTime, createTimeOffLogger: log, debugLog: _debugLog } = require("../utils");
const { findSuitableLeaveType } = require("../timeoff/logic");
const { removeFromActionFile } = require("../timeoff/action-file");
const { withCreateLock } = require("../timeoff/lock");
const { connect } = require("./client");
const { createFormSession } = require("./form");
const { checkLateRequest, checkFullDayRequest, checkRun, assertSafe, workMinutesPerDay } = require("../timeoff/safety");
const {
  localDisplayToOdoo,
  localToday,
  odooToLocalDisplay,
  parseOdooDatetime,
  formatOdooDatetime,
} = require("./datetime");

const debugLog = (action, data) => _debugLog("create-timeoff.json", action, data);
const MODEL = "hr.leave";
const INACTIVE_STATES = ["cancel", "refuse"];

/**
 * Resolve the form view the calendar "New" dialog uses (calendar arch form_view_id)
 * @param {Object} conn - Connection
 * @returns {Promise<string>} Form arch
 */
async function loadDialogFormArch(conn) {
  const actionId = Number(new URL(CONFIG.urls.timeoffCreate).hash.match(/action=(\d+)/)?.[1]);
  if (!actionId) throw new Error("Cannot read the time off action id from CONFIG.urls.timeoffCreate");
  const action = await conn.rpc.call("/web/action/load", { action_id: actionId });
  const calendarViewId = action.views.find(([, type]) => type === "calendar")?.[0] || false;
  const calendar = await conn.rpc.callKw(MODEL, "load_views", [], {
    views: [[calendarViewId, "calendar"]],
    options: {},
    context: conn.context,
  });
  const formViewId = Number(calendar.fields_views.calendar.arch.match(/form_view_id="(\d+)"/)?.[1]) || false;
  const form = await conn.rpc.callKw(MODEL, "load_views", [], {
    views: [[formViewId, "form"]],
    options: {},
    context: conn.context,
  });
  debugLog("rpc_form_view", { actionId, calendarViewId, formViewId: form.fields_views.form.view_id });
  return form.fields_views.form.arch;
}

/**
 * Leave types the dropdown offers, with balances for this employee.
 * Same domain as the holiday_status_id field in the form view.
 * @param {Object} conn - Connection
 * @param {number} employeeId - Employee id
 * @returns {Promise<Array<{id: number, name: string, remaining: number, requestUnit: string}>>}
 */
async function fetchLeaveTypes(conn, employeeId) {
  const today = localToday(conn.tz);
  const domain = [
    "|", ["validity_start", "=", false], ["validity_start", "<=", today],
    "|", ["validity_stop", "=", false], ["validity_stop", ">=", today],
    "|", ["allow_use_negative_leave", "=", true],
    "&", ["virtual_remaining_leaves", ">", 0],
    "|", ["allocation_type", "in", ["fixed_allocation", "no"]],
    "&", ["allocation_type", "=", "fixed"], ["max_leaves", ">", "0"],
  ];
  const types = await conn.rpc.callKw("hr.leave.type", "search_read", [], {
    domain,
    fields: ["name", "request_unit", "virtual_remaining_leaves"],
    context: { ...conn.context, employee_id: employeeId, default_date_from: false },
  });
  // The dropdown shows virtual remaining (pending requests already deducted), rounded to 2 decimals.
  return types.map((t) => ({
    id: t.id,
    name: t.name,
    requestUnit: t.request_unit,
    remaining: Math.round(t.virtual_remaining_leaves * 100) / 100,
  }));
}

/**
 * Active time off of this employee touching the local day of `dateFrom`
 * @returns {Promise<Array<{id, date_from, date_to, state}>>}
 */
async function findActiveLeavesOnDay(conn, employeeId, date) {
  const dayStart = localDisplayToOdoo(`${date} 00:00`, conn.tz);
  const dayEnd = formatOdooDatetime(parseOdooDatetime(dayStart) + 24 * 3600 * 1000);
  return conn.rpc.callKw(MODEL, "search_read", [], {
    domain: [
      ["employee_id", "=", employeeId],
      ["state", "not in", INACTIVE_STATES],
      ["date_from", "<", dayEnd],
      ["date_to", ">", dayStart],
    ],
    fields: ["date_from", "date_to", "holiday_status_id", "state"],
    context: conn.context,
  }).then((leaves) => leaves.map((leave) => ({ ...leave, dayStart, dayEnd })));
}

/** Minutes of a leave that fall inside its day window */
function minutesWithinDay(leave) {
  const from = Math.max(parseOdooDatetime(leave.date_from), parseOdooDatetime(leave.dayStart));
  const to = Math.min(parseOdooDatetime(leave.date_to), parseOdooDatetime(leave.dayEnd));
  return Math.max(0, (to - from) / 60000);
}

/**
 * Employee chosen by the form must belong to the logged-in user
 * @returns {Promise<boolean>}
 */
async function employeeBelongsToUser(conn, employeeId) {
  const [employee] = await conn.rpc.callKw("hr.employee", "read", [[employeeId], ["user_id"]], { context: conn.context });
  return employee?.user_id?.[0] === conn.uid;
}

/**
 * Attendance of the employee starting on that local day, as the list view shows it
 * @returns {Promise<Array<{checkIn: string, lateMinutes: number}>>} checkIn is local "HH:MM"
 */
async function findAttendanceOnDay(conn, employeeId, date) {
  const dayStart = localDisplayToOdoo(`${date} 00:00`, conn.tz);
  const dayEnd = formatOdooDatetime(parseOdooDatetime(dayStart) + 24 * 3600 * 1000);
  const rows = await conn.rpc.callKw("hr.attendance", "search_read", [], {
    domain: [["employee_id", "=", employeeId], ["check_in", ">=", dayStart], ["check_in", "<", dayEnd]],
    fields: ["check_in", "hours_arrive_late"],
    order: "check_in asc",
    context: conn.context,
  });
  return rows.map((row) => ({
    checkIn: extractTimeFromDateTime(odooToLocalDisplay(row.check_in, conn.tz)),
    lateMinutes: Math.round((row.hours_arrive_late || 0) * 60),
  }));
}

/**
 * Fill, validate, create and read back one time off request, replaying the web client's dialog.
 * @param {Object} conn - Connection
 * @param {string} arch - Dialog form arch
 * @param {Object} request - What to create
 * @param {string} request.date - "DD/MM/YYYY"
 * @param {string} request.start - Local "DD/MM/YYYY HH:MM"
 * @param {string} request.end - Local "DD/MM/YYYY HH:MM"
 * @param {number} request.minutes - Minutes the server must count for it
 * @param {string} request.reason - Description
 * @param {function} request.checkSafety - async ({start, end, minutes, otherMinutesThatDay, employeeId, today}) => violations
 * @param {Object} options - {dryRun, today}
 * @returns {Promise<{status: string, ...}>} status: created | unverified | exists | skipped | dry-run
 */
async function submitLeaveRequest(conn, arch, request, { dryRun = false, today = localToday(conn.tz) } = {}) {
  const { date, start, end, minutes, reason, checkSafety } = request;
  const requiredHours = Math.ceil((minutes / 60) * 100) / 100;
  const dateFrom = localDisplayToOdoo(start, conn.tz);
  const dateTo = localDisplayToOdoo(end, conn.tz);

  log.createStart(date, extractTimeFromDateTime(end), minutes, requiredHours, extractTimeFromDateTime(start));
  debugLog("rpc_create_start", { date, minutes, dateFrom, dateTo, dryRun });

  // 1. Open the dialog: the server fills employee, approvers, tz and the default type.
  const form = createFormSession(conn.rpc, MODEL, arch, conn.context);
  await form.open();
  const employeeId = form.values.employee_id;
  if (!employeeId) throw new Error("Form did not resolve the employee");

  // 2. Never create a second request over the same time range.
  const dayLeaves = await findActiveLeavesOnDay(conn, employeeId, date);
  const overlapping = dayLeaves.filter((l) => l.date_from < dateTo && l.date_to > dateFrom);
  if (overlapping.length) {
    debugLog("rpc_create_exists", { date, overlapping });
    return { status: "exists", date, existing: overlapping };
  }

  // 3. Pick the leave type with the priority rules, from the same list the dropdown shows.
  const hourTypes = (await fetchLeaveTypes(conn, employeeId)).filter((t) => t.requestUnit === "hour");
  log.leaveTypes(hourTypes.filter((t) => t.remaining > 0));
  let leaveType;
  try {
    leaveType = findSuitableLeaveType(hourTypes, requiredHours);
  } catch (err) {
    log.skipping(err.message);
    return { status: "skipped", date, reason: err.message };
  }
  log.selectedType(leaveType);

  // 4. Fill in the dialog order the UI uses; each onchange lets the server recompute dependent fields.
  await form.set("holiday_status_id", leaveType.id, { employee_id: employeeId, default_date_from: false });
  await form.set("date_to", dateTo);
  await form.set("date_from", dateFrom);
  await form.set("name", reason);

  // 5. Validate what the server computed before saving.
  const values = form.values;
  const problems = [];
  if (form.warnings.length) problems.push(`onchange warning: ${form.warnings.map((w) => w.message || w.title).join("; ")}`);
  if (values.holiday_status_id !== leaveType.id) problems.push(`leave type was reset to ${values.holiday_status_id}`);
  if (values.date_from !== dateFrom || values.date_to !== dateTo) {
    problems.push(`dates changed to ${values.date_from} -> ${values.date_to}`);
  }
  if (values.number_of_minutes_display !== minutes) {
    problems.push(`duration is ${values.number_of_minutes_display} mins, expected ${minutes}`);
  }
  const missing = form.missingRequired();
  if (missing.length) problems.push(`required fields empty: ${missing.join(", ")}`);
  if (problems.length) throw new Error(`Form validation failed: ${problems.join("; ")}`);
  log.durationValid(values.number_of_minutes_display);

  // 6. Hard safety rules on what would actually be saved (server-computed values).
  const violations = await checkSafety({
    start: odooToLocalDisplay(values.date_from, conn.tz),
    end: odooToLocalDisplay(values.date_to, conn.tz),
    minutes: values.number_of_minutes_display,
    otherMinutesThatDay: dayLeaves.reduce((sum, l) => sum + minutesWithinDay(l), 0),
    employeeId,
    today,
  });
  if (!BUSINESS.safety.allowedStates.includes(values.state)) violations.push(`state would be "${values.state}"`);
  if (!(await employeeBelongsToUser(conn, employeeId))) violations.push(`employee ${employeeId} is not the logged-in user`);
  assertSafe(violations, date);

  const createValues = form.createValues();
  debugLog("rpc_create_values", { date, createValues });
  if (dryRun) return { status: "dry-run", date, leaveType, createValues };

  // 7. Create, then read the record back by id.
  const id = await conn.rpc.callKw(MODEL, "create", [createValues], { context: conn.context });
  const [saved] = await conn.rpc.callKw(MODEL, "read", [[id], ["state", "date_from", "date_to", "holiday_status_id", "number_of_minutes_display"]], {
    context: conn.context,
  });
  const mismatches = [];
  if (!saved) mismatches.push("record not readable");
  else {
    if (INACTIVE_STATES.includes(saved.state)) mismatches.push(`state=${saved.state}`);
    if (saved.date_from !== dateFrom) mismatches.push(`date_from=${saved.date_from} (sent ${dateFrom})`);
    if (saved.date_to !== dateTo) mismatches.push(`date_to=${saved.date_to} (sent ${dateTo})`);
    if (saved.holiday_status_id?.[0] !== leaveType.id) mismatches.push(`type=${saved.holiday_status_id?.[1]} (sent ${leaveType.name})`);
    if (saved.number_of_minutes_display !== minutes) mismatches.push(`minutes=${saved.number_of_minutes_display} (sent ${minutes})`);
  }
  debugLog("rpc_create_saved", { date, id, saved, mismatches });

  const result = { date, canonicalDate: request.canonicalDate, id, start, end, reason, leaveType: leaveType.name };
  if (!mismatches.length) {
    log.verified(id);
    return { status: "created", ...result, saved };
  }
  // The record exists on Bemo but differs from what was sent: never delete it automatically.
  log.unverified(date, id, mismatches);
  return { status: "unverified", ...result, saved, mismatches };
}

/**
 * Create one late-arrival time off request (08:00 -> check-in time)
 * @param {Object} conn - Connection
 * @param {string} arch - Dialog form arch
 * @param {Object} record - Late record {date, checkInDateTime, lateMinutes, reason}
 * @param {Object} options - {dryRun, today}
 */
async function createLateTimeOff(conn, arch, record, options = {}) {
  const { date, checkInDateTime, lateMinutes } = record;
  const start = `${date} ${BUSINESS.workSchedule.start}`;
  const end = `${date} ${extractTimeFromDateTime(checkInDateTime)}`;
  return submitLeaveRequest(
    conn,
    arch,
    {
      date,
      canonicalDate: record.canonicalDate,
      start,
      end,
      minutes: lateMinutes,
      reason: record.reason || BUSINESS.lateArrival.defaultReason,
      checkSafety: async (saved) =>
        checkLateRequest(
          { date, start: saved.start, end: saved.end, lateMinutes },
          { ...saved, attendance: await findAttendanceOnDay(conn, saved.employeeId, date) },
        ),
    },
    options,
  );
}

/**
 * Create one full-day time off request (workSchedule.start -> workSchedule.end)
 * @param {Object} conn - Connection
 * @param {string} arch - Dialog form arch
 * @param {Object} record - {date: "DD/MM/YYYY", reason?}
 * @param {Object} options - {dryRun, today}
 */
async function createFullDayTimeOff(conn, arch, record, options = {}) {
  const { date } = record;
  const schedule = BUSINESS.workSchedule;
  return submitLeaveRequest(
    conn,
    arch,
    {
      date,
      start: `${date} ${schedule.start}`,
      end: `${date} ${schedule.end}`,
      minutes: workMinutesPerDay(schedule),
      reason: record.reason || BUSINESS.fullDayLeave.defaultReason,
      checkSafety: async (saved) =>
        checkFullDayRequest(
          { date, start: saved.start, end: saved.end, minutes: saved.minutes },
          { ...saved, hasAttendance: (await findAttendanceOnDay(conn, saved.employeeId, date)).length > 0 },
        ),
    },
    options,
  );
}

/**
 * Create late time off for several records (same summary shape as the browser engine)
 * @param {Array<Object>} records - Late records
 * @param {Object} options - Options
 * @param {boolean} [options.dryRun=false] - Validate without creating
 * @param {Object} [options.conn] - Existing connection (tests)
 * @param {boolean} [options.updateActionFile=true] - Remove handled dates from action-needed.json
 * @param {string} [options.lockFile] - Lock file path (tests)
 * @returns {Promise<{created: Array, unverified: Array, failed: Array, skipped: Array, dryRun: Array}>}
 */
async function createTimeOffViaApi(records, { dryRun = false, conn = null, updateActionFile = true, lockFile } = {}) {
  const summary = { created: [], unverified: [], failed: [], skipped: [], dryRun: [] };
  if (!records.length) {
    log.nothingToCreate();
    return summary;
  }
  assertSafe(checkRun(records), "run");

  // Dry runs write nothing, so they may run next to a real one.
  const run = () => runBatch(records, summary, { dryRun, conn, updateActionFile });
  return dryRun ? run() : withCreateLock(run, lockFile ? { lockFile } : {});
}

async function runBatch(records, summary, { dryRun, conn, updateActionFile }) {
  const connection = conn || (await connect());
  const arch = await loadDialogFormArch(connection);
  log.modeInfo(records.length);

  for (const record of records) {
    try {
      const create = record.kind === "full-day" ? createFullDayTimeOff : createLateTimeOff;
      const result = await create(connection, arch, record, { dryRun });
      if (result.status === "created") summary.created.push(result);
      else if (result.status === "unverified") summary.unverified.push(result);
      else if (result.status === "dry-run") summary.dryRun.push(result);
      else {
        if (result.status === "exists") log.alreadyExists(record.date);
        summary.skipped.push({ date: record.date, reason: result.status === "exists" ? "already exists" : result.reason });
      }
      if (updateActionFile && !dryRun && (result.status === "created" || result.status === "exists")) {
        removeFromActionFile([record.date]);
        log.removed(record.date);
      }
    } catch (err) {
      // A session problem affects every record: stop instead of failing them one by one.
      if (err.code === "BEMO_NOT_LOGGED_IN") throw err;
      log.failed(err.message);
      debugLog("rpc_create_failed", { date: record.date, error: err.message });
      summary.failed.push({ date: record.date, error: err.message });
    }
  }

  log.summary(summary.created.length, summary.failed.length, summary.skipped.length, summary.unverified.length);
  return summary;
}

module.exports = {
  createTimeOffViaApi,
  createLateTimeOff,
  createFullDayTimeOff,
  findActiveLeavesOnDay,
  fetchLeaveTypes,
  loadDialogFormArch,
};
