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

const { planLeaveSplit, toWallClockRanges } = require("../src/timeoff/logic");
const SCHEDULE = { start: "08:00", lunchStart: "12:00", lunchEnd: "13:00", end: "17:00" };

test("planLeaveSplit uses one type when it has enough, otherwise splits in priority order", () => {
  const plenty = [{ name: "Annual Leave 2026 - Hours", remaining: 14.67 }, { name: "Compensatory Leave 2026 - Hours", remaining: 4 }];
  assert.deepEqual(planLeaveSplit(plenty, 480).map((p) => [p.type.name, p.minutes]), [["Annual Leave 2026 - Hours", 480]]);

  const short = [{ name: "Annual Leave 2026 - Hours", remaining: 6.67 }, { name: "Compensatory Leave 2026 - Hours", remaining: 4 }];
  assert.deepEqual(planLeaveSplit(short, 480).map((p) => [p.type.name, p.minutes]), [
    ["Annual Leave 2026 - Hours", 400],
    ["Compensatory Leave 2026 - Hours", 80],
  ]);

  const empty = [{ name: "Annual Leave 2026 - Hours", remaining: 2 }, { name: "Compensatory Leave 2026 - Hours", remaining: 1 }];
  assert.throws(() => planLeaveSplit(empty, 480), /even when split. Required: 480 mins, available: 180 mins/);
});

test("toWallClockRanges skips lunch and starts the next part after lunch on a boundary", () => {
  assert.deepEqual(toWallClockRanges([480], SCHEDULE), [{ start: "08:00", end: "17:00" }]);
  assert.deepEqual(toWallClockRanges([400, 80], SCHEDULE), [{ start: "08:00", end: "15:40" }, { start: "15:40", end: "17:00" }]);
  assert.deepEqual(toWallClockRanges([240, 240], SCHEDULE), [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "17:00" }]);
  assert.deepEqual(toWallClockRanges([100, 380], SCHEDULE), [{ start: "08:00", end: "09:40" }, { start: "09:40", end: "17:00" }]);
  assert.throws(() => toWallClockRanges([481], SCHEDULE), /exceed the working day/);
});
