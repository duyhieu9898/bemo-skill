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
const { cronMessage } = require("../scripts/run-cron-telegram");

test("a success shows only the summary line and a menu button", () => {
  const { text, buttons } = cronMessage({ exitCode: 0, output: "🚀 Starting\n» ✅ Đã checkout lúc 17:00:03\n" }, "17:00:05");
  assert.equal(text, "✅ Bemo checkout thành công\n🕒 17:00:05\n\n✅ Đã checkout lúc 17:00:03");
  assert.deepEqual(buttons, [{ text: "📋 Menu", callback_data: "menu" }]);
});

test("a skip because auto is off offers to turn it back on", () => {
  const { text, buttons } = cronMessage({ exitCode: 10, output: "» Tự động: TẮT từ 06/10/2026 (2 ngày) — x\n" }, "t");
  assert.match(text, /^⏸️ Bemo checkout bỏ qua/);
  assert.deepEqual(buttons[0], { text: "⚙️ Bật lại tự động", callback_data: "cmd:bemo_auto_on" });
});

test("a failure without a summary still shows the last log lines", () => {
  const { text } = cronMessage({ exitCode: 1, output: "a\nb\nTypeError: boom\n" }, "t");
  assert.match(text, /🔢 Exit code: 1/);
  assert.match(text, /TypeError: boom/);
});

test("a failure with a summary adds the last log lines below it", () => {
  const { text } = cronMessage({ exitCode: 1, output: "❌ x\n» 🔐 Hết phiên đăng nhập Bemo → /bemo_login\n" }, "t");
  assert.match(text, /🔐 Hết phiên đăng nhập Bemo → \/bemo_login\n\n📋 Log:\n❌ x/);
});
