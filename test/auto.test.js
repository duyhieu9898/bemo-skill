const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readAuto, setAuto, describeAuto } = require("../src/timeoff/auto");

function files() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bemo-auto-"));
  return { file: path.join(dir, "auto.json"), legacyFile: path.join(dir, "overtime.json") };
}

test("defaults to enabled when nothing is stored", () => {
  assert.deepEqual(readAuto({ ...files(), today: "2026-10-06" }), { enabled: true, changedAt: null });
});

test("off persists across days until turned on", () => {
  const f = files();
  setAuto(false, { ...f, today: "2026-10-06" });
  assert.equal(readAuto({ ...f, today: "2026-10-09" }).enabled, false);
  setAuto(true, { ...f, today: "2026-10-09" });
  assert.deepEqual(readAuto({ ...f, today: "2026-10-10" }), { enabled: true, changedAt: "2026-10-09" });
});

test("turning off twice keeps the original date", () => {
  const f = files();
  setAuto(false, { ...f, today: "2026-10-06" });
  const state = setAuto(false, { ...f, today: "2026-10-08" });
  assert.equal(state.changedAt, "2026-10-06");
});

test("describeAuto states on and off plainly", () => {
  assert.equal(describeAuto({ enabled: true, changedAt: null }), "Tự động: BẬT — checkout 17:00 sẽ chạy.");
  assert.equal(
    describeAuto({ enabled: false, changedAt: "2026-10-06" }, "2026-10-08"),
    "Tự động: TẮT từ 06/10/2026 (3 ngày) — checkout 17:00 không chạy. /bemo_auto_on để bật lại.",
  );
});

test("legacy overtime file marking today migrates to off and is removed", () => {
  const f = files();
  fs.writeFileSync(f.legacyFile, JSON.stringify({ dates: ["2026-10-06", "2026-10-07"] }));
  assert.deepEqual(readAuto({ ...f, today: "2026-10-06" }), { enabled: false, changedAt: "2026-10-06" });
  assert.equal(fs.existsSync(f.legacyFile), false);
  assert.equal(JSON.parse(fs.readFileSync(f.file, "utf8")).enabled, false);
});

test("legacy overtime file without today migrates to on", () => {
  const f = files();
  fs.writeFileSync(f.legacyFile, JSON.stringify({ dates: ["2026-10-07"] }));
  assert.deepEqual(readAuto({ ...f, today: "2026-10-06" }), { enabled: true, changedAt: "2026-10-06" });
  assert.equal(fs.existsSync(f.legacyFile), false);
});

test("an unreadable auto.json reads as off so a scheduled checkout skips", () => {
  const f = files();
  fs.writeFileSync(f.file, "{");
  assert.deepEqual(readAuto({ ...f, today: "2026-10-06" }), { enabled: false, changedAt: null });
  fs.writeFileSync(f.file, JSON.stringify({ enabled: "no" }));
  assert.equal(readAuto({ ...f, today: "2026-10-06" }).enabled, false);
});

test("setAuto fails loudly when the state cannot be saved", () => {
  const f = files();
  fs.writeFileSync(f.legacyFile, "not a directory");
  const file = path.join(f.legacyFile, "auto.json");
  assert.throws(() => setAuto(false, { file, legacyFile: f.legacyFile + ".none", today: "2026-10-06" }), /Không lưu được/);
});

test("migration keeps the legacy file when saving fails", () => {
  const f = files();
  fs.writeFileSync(f.legacyFile, JSON.stringify({ dates: ["2026-10-06"] }));
  const blocker = path.join(path.dirname(f.file), "blocker");
  fs.writeFileSync(blocker, "");
  assert.throws(() => readAuto({ file: path.join(blocker, "auto.json"), legacyFile: f.legacyFile, today: "2026-10-06" }), /Không lưu được/);
  assert.equal(fs.existsSync(f.legacyFile), true);
});
