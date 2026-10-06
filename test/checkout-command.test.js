const test = require("node:test");
const assert = require("node:assert/strict");

const { scheduledSkipReason, checkoutOutcome } = require("../src/commands/checkout");

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

test("a confirmed click is a successful checkout", () => {
  assert.deepEqual(checkoutOutcome({ clicked: true, action: "Check out" }), { exitCode: 0, message: null });
});

test("no click is reported as a skip with the button Bemo showed, never as success", () => {
  const outcome = checkoutOutcome({ clicked: false, action: "Check in" });
  assert.equal(outcome.exitCode, 10);
  assert.match(outcome.message, /Không checkout: Bemo đang hiện nút "Check in"/);
  assert.match(outcome.message, /chưa check-in hôm nay|đã checkout/);
});
