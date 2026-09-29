const test = require("node:test");
const assert = require("node:assert/strict");

const { parseStdinInput } = require("../src/create-full-day");

test("agent input: ISO dates become Bemo dates, reason is optional", () => {
  assert.deepEqual(parseStdinInput('{"dates":["2026-09-18"]}'), { dates: ["18/09/2026"], reason: undefined });
  assert.deepEqual(parseStdinInput('{"dates":["2026-09-18"],"reason":" ốm "}'), { dates: ["18/09/2026"], reason: "ốm" });
});

test("agent input: rejects empty, malformed and impossible dates", () => {
  assert.throws(() => parseStdinInput('{"dates":[]}'), /non-empty dates/);
  assert.throws(() => parseStdinInput('{"dates":["18/09/2026"]}'), /use YYYY-MM-DD/);
  assert.throws(() => parseStdinInput('{"dates":["2026-02-30"]}'), /Invalid date/);
  assert.throws(() => parseStdinInput('{"dates":["2026-09-18"],"reason":""}'), /reason/);
});
