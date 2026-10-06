const test = require("node:test");
const assert = require("node:assert/strict");

// Never let this test reach Bemo: if the runner ever runs its job on load, the job is a no-op.
process.env.JOB_COMMAND = "true";
process.env.TELEGRAM_BOT_TOKEN = "test";
process.env.TELEGRAM_CHAT_ID = "test";
const { describeResult } = require("../scripts/run-cron-telegram");

test("exit 0 is a successful checkout", () => {
  assert.deepEqual(describeResult({ exitCode: 0 }), { ok: true, icon: "✅", title: "Bemo checkout thành công" });
});

test("exit 10 is a skip, not a success and not a failure", () => {
  assert.deepEqual(describeResult({ exitCode: 10 }), { ok: true, icon: "⏸️", title: "Bemo checkout bỏ qua" });
});

test("other exits and signals are failures", () => {
  assert.equal(describeResult({ exitCode: 1 }).ok, false);
  assert.equal(describeResult({ exitCode: 0, signal: "SIGTERM" }).ok, false);
});
