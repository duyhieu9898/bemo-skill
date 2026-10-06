const test = require("node:test");
const assert = require("node:assert/strict");

const { formatDryRun, summaryExitCode } = require("../src/timeoff/create");

const empty = { created: [], unverified: [], failed: [], skipped: [], dryRun: [] };
const one = {
  ...empty,
  dryRun: [{ date: "20/10/2026", parts: [{ leaveType: "Annual Leave", minutes: 480, createValues: {} }] }],
};

test("dry run lists each part with leave type and minutes", () => {
  assert.equal(formatDryRun(one), "🧪 20/10/2026: Annual Leave — 480 phút");
  assert.equal(formatDryRun(empty), "Không có đơn nào để tạo.");
});

test("exit code: 10 when a dry run has nothing to create, 1 on failure, else 0", () => {
  assert.equal(summaryExitCode(empty, { dryRun: true }), 10);
  assert.equal(summaryExitCode(one, { dryRun: true }), 0);
  assert.equal(summaryExitCode({ ...one, failed: [{ date: "x" }] }, { dryRun: true }), 1);
  assert.equal(summaryExitCode({ ...empty, unverified: [{ date: "x" }] }, { dryRun: false }), 1);
  assert.equal(summaryExitCode(empty, { dryRun: false }), 0);
});
