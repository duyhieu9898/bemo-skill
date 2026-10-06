const test = require("node:test");
const assert = require("node:assert/strict");

const { listLateRecords, formatLateDays } = require("../src/timeoff/late-days");

const actionData = {
  timestamp: "2026-07-06T08:00:00.000Z",
  records: [
    { date: "03/07/2026", checkInDateTime: "03/07/2026 08:20", lateMinutes: 20, reason: "r3" },
    { date: "01/07/2026", checkInDateTime: "01/07/2026 08:10", lateMinutes: 10, reason: "r1" },
  ],
};

test("lists late days sorted by date", () => {
  const list = listLateRecords(actionData);
  assert.equal(list.syncedAt, "2026-07-06T08:00:00.000Z");
  assert.deepEqual(list.records.map((r) => r.date), ["2026-07-01", "2026-07-03"]);
});

test("formats late days for a human", () => {
  assert.equal(
    formatLateDays(listLateRecords(actionData)),
    "2 ngày đi trễ chờ xử lý:\n- 01/07/2026: vào 08:10 (trễ 10 phút)\n- 03/07/2026: vào 08:20 (trễ 20 phút)",
  );
});

test("says so when nothing is pending", () => {
  assert.equal(formatLateDays(listLateRecords({ records: [] })), "Không có ngày đi trễ nào chờ xử lý.");
});

test("refuses an invalid date instead of hiding it", () => {
  assert.throws(() => listLateRecords({ records: [{ date: "31/02/2026", lateMinutes: 5 }] }), /Ngày không hợp lệ/);
});
