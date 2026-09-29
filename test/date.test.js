const test = require("node:test");
const assert = require("node:assert/strict");

const {
  toIsoDate,
  isoToDisplay,
  parseLocalDateTime,
  previousMonthStart,
  getFilterMonths,
  isInFilterMonths,
  addMonths,
} = require("../src/utils/date");

test("toIsoDate accepts Bemo and ISO dates and rejects impossible ones", () => {
  assert.equal(toIsoDate("18/09/2026"), "2026-09-18");
  assert.equal(toIsoDate("2026-09-18"), "2026-09-18");
  assert.equal(toIsoDate("31/02/2026"), null);
  assert.equal(toIsoDate("2026-9-18"), null);
  assert.equal(toIsoDate(undefined), null);
  assert.equal(isoToDisplay("2026-09-18"), "18/09/2026");
});

test("parseLocalDateTime reads minutes since midnight and validates the date", () => {
  assert.deepEqual(parseLocalDateTime("18/09/2026 17:00"), { date: "18/09/2026", minutes: 1020 });
  assert.deepEqual(parseLocalDateTime("18/09/2026 08:00:00"), { date: "18/09/2026", minutes: 480 });
  assert.equal(parseLocalDateTime("31/02/2026 08:00"), null);
});

test("month helpers roll over years without using the machine timezone", () => {
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(previousMonthStart("2026-01-15"), "2025-12-01");
  assert.deepEqual(getFilterMonths("2026-01-01"), ["2026-01", "2025-12"]);
  assert.equal(isInFilterMonths("01/12/2025 08:00", ["2025-12"]), true);
  assert.equal(isInFilterMonths("30/11/2025 08:00", ["2025-12"]), false);
  assert.equal(isInFilterMonths("garbage", ["2025-12"]), false);
});
