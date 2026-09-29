const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildPlan,
  executePlan,
  listLateRecords,
  validatePlan,
} = require("../src/workflows/late-timeoff");

const actionData = {
  timestamp: "2026-07-06T08:00:00.000Z",
  records: [
    { date: "03/07/2026", checkInDateTime: "03/07/2026 08:20", lateMinutes: 20, reason: "r3" },
    { date: "01/07/2026", checkInDateTime: "01/07/2026 08:10", lateMinutes: 10, reason: "r1" },
    { date: "02/07/2026", checkInDateTime: "02/07/2026 08:15", lateMinutes: 15, reason: "r2" },
  ],
};

const options = {
  traceId: "trace-bemo-plan",
  createdAt: "2026-07-06T08:00:00.000Z",
  expiresAt: "2026-07-06T08:02:00.000Z",
};

test("buildPlan filters exact skip dates and produces deterministic records", () => {
  const plan = buildPlan(actionData, ["2026-07-02"], options);

  assert.deepEqual(plan.skippedDates, ["2026-07-02"]);
  assert.deepEqual(plan.createDates, ["2026-07-01", "2026-07-03"]);
  assert.match(plan.sourceDigest, /^[a-f0-9]{64}$/);
  assert.match(plan.selectedDigest, /^[a-f0-9]{64}$/);
});

test("buildPlan rejects malformed, duplicate, and unknown skip dates", () => {
  assert.throws(() => buildPlan(actionData, ["2026-02-30"], options), /Invalid date/);
  assert.throws(
    () => buildPlan(actionData, ["2026-07-02", "2026-07-02"], options),
    /duplicates/,
  );
  assert.throws(() => buildPlan(actionData, ["2026-07-09"], options), /not in the late list/);
});

test("validatePlan refuses expiry, tampering, and skipped records", () => {
  const plan = buildPlan(actionData, ["2026-07-02"], options);
  assert.throws(() => validatePlan(plan, actionData, new Date("2026-07-06T08:03:00.000Z")), /expired/);
  assert.throws(
    () => validatePlan({ ...plan, sourceDigest: "0".repeat(64) }, actionData, new Date("2026-07-06T08:01:00.000Z")),
    /source changed/,
  );
  assert.throws(
    () => validatePlan({ ...plan, skippedDates: ["2026-07-01"] }, actionData, new Date("2026-07-06T08:01:00.000Z")),
    /overlap/,
  );
});

test("listLateRecords returns structured data without reasons", () => {
  const listed = listLateRecords(actionData);

  assert.equal(listed.count, 3);
  assert.deepEqual(listed.records.map((record) => record.date), [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
  ]);
  assert.equal("reason" in listed.records[0], false);
});

test("executePlan passes only selected records to the create engine", async () => {
  const plan = buildPlan(actionData, ["2026-07-02"], options);
  let received = [];

  const result = await executePlan(plan, actionData, {
    now: new Date("2026-07-06T08:01:00.000Z"),
    create: async (_headless, _manual, _skipVerify, records) => {
      received = records;
      return { created: records, failed: [], skipped: [] };
    },
  });

  assert.deepEqual(received.map((record) => record.canonicalDate), ["2026-07-01", "2026-07-03"]);
  assert.deepEqual(result.createdDates, ["2026-07-01", "2026-07-03"]);
});

test("executePlan refuses a tampered plan without calling create", async () => {
  const plan = buildPlan(actionData, [], options);
  let called = false;

  await assert.rejects(
    executePlan({ ...plan, selectedDigest: "bad" }, actionData, {
      now: new Date("2026-07-06T08:01:00.000Z"),
      create: async () => {
        called = true;
      },
    }),
    /selected dates do not match/,
  );
  assert.equal(called, false);
});

test("executePlan reports saved-but-unverified dates separately from failures", async () => {
  const plan = buildPlan(actionData, [], options);

  const result = await executePlan(plan, actionData, {
    now: new Date("2026-07-06T08:01:00.000Z"),
    create: async (_headless, _manual, _skipVerify, records) => ({
      created: records.slice(1),
      unverified: records.slice(0, 1),
      failed: [],
      skipped: [],
    }),
  });

  assert.deepEqual(result.unverifiedDates, ["2026-07-01"]);
  assert.deepEqual(result.createdDates, ["2026-07-02", "2026-07-03"]);
  assert.deepEqual(result.failed, []);
});
