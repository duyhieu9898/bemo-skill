const test = require("node:test");
const assert = require("node:assert/strict");

const { formatCreateResult } = require("../src/timeoff/create");
const { formatVerify } = require("../src/timeoff/verify");

const empty = { created: [], unverified: [], failed: [], skipped: [], dryRun: [] };

test("creation result: count, then one line per skipped, failed and unverified day", () => {
  assert.equal(formatCreateResult({ ...empty, created: [{ date: "01/07/2026" }, { date: "02/07/2026" }] }), "✅ Đã tạo 2 đơn");
  assert.equal(
    formatCreateResult({
      ...empty,
      skipped: [{ date: "03/07/2026", reason: "already exists" }, { date: "04/07/2026", reason: "weekend" }],
      failed: [{ date: "05/07/2026", error: "Insufficient balance" }],
      unverified: [{ date: "06/07/2026", id: 77 }],
    }),
    [
      "✅ Đã tạo 0 đơn",
      "⏭ 03/07/2026: đã có",
      "⏭ 04/07/2026: weekend",
      "❌ 05/07/2026: Insufficient balance",
      "⚠️ 06/07/2026: đã lưu nhưng khác yêu cầu (#77) — kiểm tra trên Bemo",
    ].join("\n"),
  );
});

test("verify result in one line", () => {
  assert.equal(formatVerify({ verified: 0, missing: 0 }), "🔎 Không có ngày nào cần kiểm tra");
  assert.equal(formatVerify({ verified: 2, missing: 1 }), "🔎 2 ngày đã có time-off, 1 ngày còn thiếu");
});
