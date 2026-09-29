const test = require("node:test");
const assert = require("node:assert/strict");

const { findSuitableLeaveType } = require("../src/timeoff/logic");

const TYPES = [
  { name: "Annual Leave 2026 - Hours", remaining: 14.67 },
  { name: "Annual Leave 2025 - Hours", remaining: 0.2 },
  { name: "Compensatory Leave 2026 - Hours", remaining: 4 },
];

test("configured priority: annual leave (oldest year first), then compensatory leave", () => {
  assert.equal(findSuitableLeaveType(TYPES, 0.1).name, "Annual Leave 2025 - Hours");
  assert.equal(findSuitableLeaveType(TYPES, 0.5).name, "Annual Leave 2026 - Hours");

  const annualAlmostEmpty = [
    { name: "Annual Leave 2026 - Hours", remaining: 0.3 },
    { name: "Compensatory Leave 2026 - Hours", remaining: 4 },
  ];
  assert.equal(findSuitableLeaveType(annualAlmostEmpty, 0.5).name, "Compensatory Leave 2026 - Hours");
  assert.throws(() => findSuitableLeaveType(annualAlmostEmpty, 5), /Insufficient balance in Annual Leave, Compensatory Leave/);
});

test("priority list order decides between leave kinds", () => {
  const priority = ["Compensatory Leave", "Annual Leave"];
  assert.equal(findSuitableLeaveType(TYPES, 0.5, priority).name, "Compensatory Leave 2026 - Hours");
  assert.equal(findSuitableLeaveType(TYPES, 5, priority).name, "Annual Leave 2026 - Hours");
  assert.throws(() => findSuitableLeaveType(TYPES, 20, priority), /Insufficient balance in Compensatory Leave, Annual Leave/);
});
