const test = require("node:test");
const assert = require("node:assert/strict");

const { checkLateRequest, checkRun } = require("../src/timeoff/safety");

const TODAY = "2026-09-29";
const ok = { date: "25/09/2026", start: "25/09/2026 08:00", end: "25/09/2026 08:37", lateMinutes: 37 };

test("a normal late request passes", () => {
  assert.deepEqual(checkLateRequest(ok, { today: TODAY }), []);
});

test("rejects more than 8 hours of time off on one day", () => {
  const violations = checkLateRequest(ok, { today: TODAY, otherMinutesThatDay: 450 });
  assert.ok(violations.some((v) => /would be 487 mins \(> 480\)/.test(v)));
});

test("rejects requests that do not look like a late arrival", () => {
  const cases = [
    [{ ...ok, start: "25/09/2026 09:00", end: "25/09/2026 09:37" }, /time off must start at 08:00/],
    [{ ...ok, end: "26/09/2026 08:37" }, /must both be on 25\/09\/2026/],
    [{ ...ok, lateMinutes: 30 }, /does not match late minutes 30/],
    [{ ...ok, end: "25/09/2026 10:00", lateMinutes: 120 }, /late minutes must be 7-60/],
    [{ ...ok, end: "25/09/2026 08:00", lateMinutes: 0 }, /end must be after start/],
    [{ ...ok, date: "31/02/2026" }, /invalid date/],
  ];
  for (const [request, pattern] of cases) {
    assert.ok(checkLateRequest(request, { today: TODAY }).some((v) => pattern.test(v)), String(pattern));
  }
});

test("rejects future dates and dates before the previous month", () => {
  const future = { date: "30/09/2026", start: "30/09/2026 08:00", end: "30/09/2026 08:10", lateMinutes: 10 };
  assert.ok(checkLateRequest(future, { today: TODAY }).some((v) => /in the future/.test(v)));
  const old = { date: "31/07/2026", start: "31/07/2026 08:00", end: "31/07/2026 08:10", lateMinutes: 10 };
  assert.ok(checkLateRequest(old, { today: TODAY }).some((v) => /older than the previous month/.test(v)));
  const lastMonth = { date: "03/08/2026", start: "03/08/2026 08:00", end: "03/08/2026 08:10", lateMinutes: 10 };
  assert.deepEqual(checkLateRequest(lastMonth, { today: TODAY }), []);
});

test("run checks catch duplicates and oversized batches", () => {
  assert.ok(checkRun([{ date: "01/09/2026" }, { date: "01/09/2026" }]).some((v) => /duplicate dates/.test(v)));
  const many = Array.from({ length: 26 }, (_, i) => ({ date: `${String(i + 1).padStart(2, "0")}/09/2026` }));
  assert.ok(checkRun(many).some((v) => /26 requests in one run/.test(v)));
});

test("late time off must end by lunch", () => {
  const BUSINESS = require("../src/business-rules");
  const request = { date: "25/09/2026", start: "25/09/2026 08:00", end: "25/09/2026 08:37", lateMinutes: 37 };
  const original = BUSINESS.workSchedule.lunchStart;
  try {
    BUSINESS.workSchedule.lunchStart = "08:30";
    assert.ok(checkLateRequest(request, { today: TODAY }).some((v) => /must end by lunch \(08:30\)/.test(v)));
    BUSINESS.workSchedule.lunchStart = "12:00";
    assert.deepEqual(checkLateRequest(request, { today: TODAY }), []);
  } finally {
    BUSINESS.workSchedule.lunchStart = original;
  }
});

test("rejects weekends and derives the daily cap from the schedule", () => {
  const saturday = { date: "26/09/2026", start: "26/09/2026 08:00", end: "26/09/2026 08:10", lateMinutes: 10 };
  assert.ok(checkLateRequest(saturday, { today: TODAY }).some((v) => /26\/09\/2026 is not a working day/.test(v)));
  const { workMinutesPerDay } = require("../src/timeoff/safety");
  assert.equal(workMinutesPerDay({ start: "08:00", lunchStart: "12:00", lunchEnd: "13:00", end: "17:00" }), 480);
});
