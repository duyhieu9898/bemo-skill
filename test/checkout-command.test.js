const test = require("node:test");
const assert = require("node:assert/strict");

const { scheduledSkipReason } = require("../src/commands/checkout");

test("manual checkout never reads the auto switch", () => {
  assert.equal(scheduledSkipReason(false, () => assert.fail("must not read")), null);
});

test("scheduled checkout runs while auto is on", () => {
  assert.equal(scheduledSkipReason(true, () => ({ enabled: true, changedAt: null })), null);
});

test("scheduled checkout is skipped with the auto description while off", () => {
  const reason = scheduledSkipReason(true, () => ({ enabled: false, changedAt: "2026-10-06" }));
  assert.match(reason, /^Tự động: TẮT từ 06\/10\/2026/);
});
