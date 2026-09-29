const test = require("node:test");
const assert = require("node:assert/strict");

const {
  odooToLocalDisplay,
  localDisplayToOdoo,
  localMonthStartToOdoo,
  localToday,
} = require("../src/rpc/datetime");

const TZ = "Asia/Saigon";

test("converts Odoo UTC datetimes to the list view display and back", () => {
  assert.equal(odooToLocalDisplay("2026-09-25 01:37:00", TZ), "25/09/2026 08:37");
  assert.equal(localDisplayToOdoo("25/09/2026 08:37", TZ), "2026-09-25 01:37:00");
  assert.equal(localDisplayToOdoo("30/09/2026 08:00:00", TZ), "2026-09-30 01:00:00");
});

test("local month boundaries handle day and year rollover", () => {
  assert.equal(localMonthStartToOdoo(2026, 8, TZ), "2026-08-31 17:00:00");
  assert.equal(localMonthStartToOdoo(2026, -1, TZ), "2025-11-30 17:00:00");
  assert.equal(localMonthStartToOdoo(2026, 12, TZ), "2026-12-31 17:00:00");
});

test("localToday follows the user's timezone, not UTC", () => {
  // 18:30 UTC is already the next day in Vietnam.
  assert.equal(localToday(TZ, Date.parse("2026-09-29T18:30:00Z")), "2026-09-30");
});

test("rejects malformed local datetimes", () => {
  assert.throws(() => localDisplayToOdoo("2026-09-25 08:00", TZ), /Invalid local datetime/);
});
