const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createLateTimeOff, createFullDayTimeOff } = require("../src/odoo/create-leave");

const arch = fs.readFileSync(path.join(__dirname, "fixtures", "hr-leave-dialog-form.xml"), "utf8");
const TODAY = "2026-09-30";
const record = { date: "30/09/2026", canonicalDate: "2026-09-30", checkInDateTime: "30/09/2026 08:15", lateMinutes: 15, reason: "late" };

/**
 * Fake Odoo that answers like the real dialog did (ids and names are fake).
 * @param {Object} overrides - Per-call overrides
 */
function fakeConn(overrides = {}) {
  const calls = [];
  const saved = {};
  const types = overrides.types || [
    { id: 44, name: "Annual Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 14.666 },
    { id: 45, name: "Compensatory Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 4 },
    { id: 43, name: "Annual Leave 2025 - Hours", request_unit: "hour", virtual_remaining_leaves: 0.1 },
    { id: 14, name: "Annual Leave 2024 - Days", request_unit: "day", virtual_remaining_leaves: 5 },
  ];
  const rpc = {
    async call(route) {
      throw new Error(`unexpected route ${route}`);
    },
    async callKw(model, method, args = [], kwargs = {}) {
      calls.push({ model, method, args, kwargs });
      if (model === "hr.leave" && method === "onchange") {
        const [, values, field] = args;
        if (Array.isArray(field)) {
          return { value: {
            state: "confirm", holiday_type: "employee", tz: "Asia/Saigon", holiday_status_id: [44, "Annual Leave 2026 - Hours"],
            employee_id: [10, "Employee"], manager_id: [20, "Manager"], approve_by_id: [30, "Approver"],
            approval_2nd_id: [40, "Director"], validation_type: "manager", date_from: false, date_to: false,
            number_of_days: 0, number_of_minutes_display: 0, number_of_hours_display: 0, email_cc_ids: [[5]], name: false,
          } };
        }
        if (field === "date_from" && values.date_from && values.date_to) {
          const from = Date.parse(values.date_from.replace(" ", "T") + "Z");
          const to = Date.parse(values.date_to.replace(" ", "T") + "Z");
          const lunchFrom = Date.parse(values.date_from.slice(0, 10) + "T05:00:00Z");
          const lunch = Math.max(0, Math.min(to, lunchFrom + 3600000) - Math.max(from, lunchFrom)) / 60000;
          const minutes = overrides.minutes ?? (to - from) / 60000 - lunch;
          return { value: { division_id: [4, "Division"], number_of_minutes_display: minutes, number_of_hours_display: minutes / 60, number_of_days: minutes / 480 } };
        }
        return { value: {} };
      }
      if (model === "hr.leave" && method === "search_read") return overrides.dayLeaves || [];
      // Default: the late record's real check-in (30/09 08:15 local = 01:15 UTC, 15 mins late).
      if (model === "hr.attendance" && method === "search_read") {
        return overrides.attendance ?? [{ check_in: "2026-09-30 01:15:00", hours_arrive_late: 0.25 }];
      }
      if (model === "hr.employee" && method === "read") return [{ id: 10, user_id: [overrides.employeeUser ?? 1, "User"] }];
      if (model === "hr.leave.type" && method === "search_read") return types;
      if (model === "hr.leave" && method === "create") {
        const id = 123 + Object.keys(saved).length;
        if (overrides.failCreateAt === Object.keys(saved).length) throw new Error("server refused");
        saved[id] = args[0];
        return id;
      }
      if (model === "hr.leave" && method === "read") {
        const id = args[0][0];
        const v = saved[id];
        return [{ id, state: v.state, date_from: v.date_from, date_to: v.date_to,
          holiday_status_id: [v.holiday_status_id, "type"],
          number_of_minutes_display: overrides.savedMinutes ?? v.number_of_minutes_display }];
      }
      throw new Error(`unexpected ${model}.${method}`);
    },
  };
  return { conn: { rpc, uid: 1, tz: "Asia/Saigon", context: { lang: "en_US", tz: "Asia/Saigon", uid: 1 } }, calls };
}

test("replays the dialog, picks the oldest annual leave with enough hours and creates exactly the UI values", async () => {
  const { conn, calls } = fakeConn();
  const result = await createLateTimeOff(conn, arch, record, { today: TODAY });

  assert.equal(result.status, "created");
  assert.equal(result.id, 123);
  // 2025 has only 0.1h left, 2024 is day-based: 2026 annual leave wins before compensatory.
  assert.equal(result.leaveType, "Annual Leave 2026 - Hours");

  const onchangeFields = calls.filter((c) => c.method === "onchange").map((c) => c.args[2]);
  assert.deepEqual(onchangeFields, [[], "holiday_status_id", "date_to", "date_from"]);
  const typeCall = calls.find((c) => c.method === "onchange" && c.args[2] === "holiday_status_id");
  assert.equal(typeCall.kwargs.context.employee_id, 10);

  const create = calls.find((c) => c.method === "create");
  assert.deepEqual(create.args[0], {
    state: "confirm", holiday_type: "employee", holiday_status_id: 44, employee_id: 10, manager_id: 20,
    division_id: 4, approve_by_id: 30, date_from: "2026-09-30 01:00:00", date_to: "2026-09-30 01:15:00",
    number_of_minutes_display: 15, number_of_hours_display: 0.25, number_of_days: 0.03125,
    approval_2nd_id: 40, name: "late",
  });
});

test("does not create when an active request already covers the range", async () => {
  const { conn, calls } = fakeConn({ dayLeaves: [{ id: 99, state: "confirm", date_from: "2026-09-30 01:00:00", date_to: "2026-09-30 01:10:00" }] });
  const result = await createLateTimeOff(conn, arch, record, { today: TODAY });

  assert.equal(result.status, "exists");
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("skips when no leave type in the priority list has enough balance", async () => {
  const { conn, calls } = fakeConn({ types: [{ id: 44, name: "Annual Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 0.2 }] });
  const result = await createLateTimeOff(conn, arch, record, { today: TODAY });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /Insufficient balance in Annual Leave, Compensatory Leave/);
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("refuses to create when the server computes a different duration", async () => {
  const { conn, calls } = fakeConn({ minutes: 20 });

  await assert.rejects(createLateTimeOff(conn, arch, record, { today: TODAY }), /duration is 20 mins, expected 15/);
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("dry run validates everything but never calls create", async () => {
  const { conn, calls } = fakeConn();
  const result = await createLateTimeOff(conn, arch, record, { dryRun: true, today: TODAY });

  assert.equal(result.status, "dry-run");
  assert.equal(result.createValues.holiday_status_id, 44);
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("refuses when the day would exceed 8 hours of time off", async () => {
  // A non-overlapping 7h50 afternoon leave already exists that day; +15 mins goes over 480.
  const { conn, calls } = fakeConn({ dayLeaves: [{ id: 98, state: "confirm", date_from: "2026-09-30 01:30:00", date_to: "2026-09-30 09:20:00" }] });

  await assert.rejects(createLateTimeOff(conn, arch, record, { today: TODAY }), /total time off on 30\/09\/2026 would be 485 mins/);
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("refuses future dates and employees that are not the logged-in user", async () => {
  const future = fakeConn();
  await assert.rejects(createLateTimeOff(future.conn, arch, record, { today: "2026-09-29" }), /is in the future/);

  const other = fakeConn({ employeeUser: 777 });
  await assert.rejects(createLateTimeOff(other.conn, arch, record, { today: TODAY }), /not the logged-in user/);
  assert.equal(other.calls.some((c) => c.method === "create"), false);
});

const fullDay = { date: "18/09/2026" };

test("full day: 08:00-17:00 counted as 480 mins, created with the full-day reason", async () => {
  const { conn, calls } = fakeConn({ attendance: [] });
  const result = await createFullDayTimeOff(conn, arch, fullDay, { today: TODAY });

  assert.equal(result.status, "created");
  const create = calls.find((c) => c.method === "create");
  assert.equal(create.args[0].date_from, "2026-09-18 01:00:00");
  assert.equal(create.args[0].date_to, "2026-09-18 10:00:00");
  assert.equal(create.args[0].number_of_minutes_display, 480);
  assert.equal(create.args[0].name, "em xin nghỉ phép cả ngày vì lý do cá nhân ạ");
});

test("full day: refused when that day has attendance", async () => {
  const { conn, calls } = fakeConn({ attendance: [{ check_in: "2026-09-18 01:02:00", hours_arrive_late: 0.03 }] });

  await assert.rejects(createFullDayTimeOff(conn, arch, fullDay, { today: TODAY }), /has attendance/);
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("full day: splits over annual then compensatory leave when no single type has 8 hours", async () => {
  const types = [
    { id: 44, name: "Annual Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 6.67 },
    { id: 45, name: "Compensatory Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 4 },
  ];
  const { conn, calls } = fakeConn({ attendance: [], types });
  const result = await createFullDayTimeOff(conn, arch, fullDay, { today: TODAY });

  assert.equal(result.status, "created");
  assert.deepEqual(result.ids, [123, 124]);
  const creates = calls.filter((c) => c.method === "create").map((c) => c.args[0]);
  assert.deepEqual(creates.map((v) => [v.holiday_status_id, v.date_from, v.date_to, v.number_of_minutes_display]), [
    [44, "2026-09-18 01:00:00", "2026-09-18 08:40:00", 400],
    [45, "2026-09-18 08:40:00", "2026-09-18 10:00:00", 80],
  ]);
});

test("full day: every part is validated before the first one is saved", async () => {
  const types = [
    { id: 44, name: "Annual Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 6.67 },
    { id: 45, name: "Compensatory Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 4 },
  ];
  // Server counts 90 mins for the second part instead of 80: nothing may be created.
  const { conn, calls } = fakeConn({ attendance: [], types });
  const onchange = conn.rpc.callKw;
  conn.rpc.callKw = async (model, method, args, kwargs) => {
    const result = await onchange(model, method, args, kwargs);
    if (method === "onchange" && args[2] === "date_from" && args[1].holiday_status_id === 45) result.value.number_of_minutes_display = 90;
    return result;
  };
  await assert.rejects(createFullDayTimeOff(conn, arch, fullDay, { today: TODAY }), /duration is 90 mins, expected 80/);
  assert.equal(calls.some((c) => c.method === "create"), false);
});

test("full day: a failure after the first part reports the saved id loudly", async () => {
  const types = [
    { id: 44, name: "Annual Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 6.67 },
    { id: 45, name: "Compensatory Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 4 },
  ];
  const { conn } = fakeConn({ attendance: [], types, failCreateAt: 1 });
  await assert.rejects(createFullDayTimeOff(conn, arch, fullDay, { today: TODAY }), /only partly created \(#123 saved\).*do NOT recreate/);
});

test("full day: skipped when even the split cannot cover 8 hours", async () => {
  const { conn } = fakeConn({ attendance: [], types: [
    { id: 44, name: "Annual Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 2 },
    { id: 45, name: "Compensatory Leave 2026 - Hours", request_unit: "hour", virtual_remaining_leaves: 1 },
  ] });
  const result = await createFullDayTimeOff(conn, arch, fullDay, { today: TODAY });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /even when split/);
});

test("late: refused when Bemo's attendance does not match the request", async () => {
  const moved = fakeConn({ attendance: [{ check_in: "2026-09-30 01:20:00", hours_arrive_late: 0.33 }] });
  await assert.rejects(createLateTimeOff(moved.conn, arch, record, { today: TODAY }), /first check-in is 08:20, request ends at 08:15/);

  const none = fakeConn({ attendance: [] });
  await assert.rejects(createLateTimeOff(none.conn, arch, record, { today: TODAY }), /no attendance on 30\/09\/2026/);
  assert.equal([...moved.calls, ...none.calls].some((c) => c.method === "create"), false);
});

test("saved record that differs from the request is reported as unverified with its id", async () => {
  const { conn } = fakeConn({ savedMinutes: 60 });
  const result = await createLateTimeOff(conn, arch, record, { today: TODAY });

  assert.equal(result.status, "unverified");
  assert.equal(result.id, 123);
  assert.deepEqual(result.mismatches, ["#123 minutes=60 (sent 15)"]);
});
