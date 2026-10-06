const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { savePreview, takePreview } = require("../src/timeoff/late-preview");

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bemo-preview-")), "preview.json");
const actionData = { timestamp: "2026-10-06T10:00:00.000Z", records: [] };
const t0 = Date.parse("2026-10-06T10:01:00.000Z");

test("apply is allowed right after a preview of the same late list, once", () => {
  const f = file();
  savePreview(actionData, { file: f, now: t0 });
  assert.doesNotThrow(() => takePreview(actionData, { file: f, now: t0 + 60_000 }));
  assert.throws(() => takePreview(actionData, { file: f, now: t0 + 61_000 }), /Chưa chạy thử/);
});

test("apply is refused when the late list changed after the preview", () => {
  const f = file();
  savePreview(actionData, { file: f, now: t0 });
  const resynced = { ...actionData, timestamp: "2026-10-06T10:00:30.000Z" };
  assert.throws(() => takePreview(resynced, { file: f, now: t0 + 1000 }), /đã thay đổi/);
});

test("apply is refused when the preview is older than 5 minutes", () => {
  const f = file();
  savePreview(actionData, { file: f, now: t0 });
  assert.throws(() => takePreview(actionData, { file: f, now: t0 + 5 * 60_000 + 1 }), /đã cũ/);
});

test("apply is refused without a preview", () => {
  assert.throws(() => takePreview(actionData, { file: file(), now: t0 }), /Chưa chạy thử/);
});
