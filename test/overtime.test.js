const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { isOvertime, setOvertime } = require("../src/overtime");
const { systemToday } = require("../src/utils/date");

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bemo-ot-")), "overtime.json");

test("marking and unmarking a day controls automatic checkout", () => {
  const file = tmpFile();
  const today = systemToday();
  assert.equal(isOvertime(today, file), false);
  setOvertime(true, today, file);
  assert.equal(isOvertime(today, file), true);
  setOvertime(false, today, file);
  assert.equal(isOvertime(today, file), false);
});

test("past days are dropped and invalid dates are refused", () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ dates: ["2000-01-01"] }));
  const dates = setOvertime(true, "2999-12-31", file);
  assert.deepEqual(dates, ["2999-12-31"]);
  assert.throws(() => setOvertime(true, "31/12/2999", file), /use YYYY-MM-DD/);
  assert.throws(() => setOvertime(true, "2999-02-30", file), /Invalid date/);
});
