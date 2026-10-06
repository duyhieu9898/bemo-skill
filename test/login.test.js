const test = require("node:test");
const assert = require("node:assert/strict");

const { requireCredentials, submitOutcome } = require("../src/browser/login");

test("credentials come from BEMO_USER/BEMO_PASS or their aliases", () => {
  assert.deepEqual(requireCredentials({ BEMO_USER: "u", BEMO_PASS: "p" }), { user: "u", pass: "p" });
  assert.deepEqual(requireCredentials({ BEMO_EMAIL: "u", BEMO_PASSWORD: "p" }), { user: "u", pass: "p" });
});

test("missing credentials fail at once instead of waiting for a manual login", () => {
  assert.throws(() => requireCredentials({}), /Thiếu BEMO_USER\/BEMO_PASS/);
});

test("still on the login page after submit means wrong credentials", () => {
  assert.equal(submitOutcome(false), "logged-in");
  assert.throws(() => submitOutcome(true), (err) => err.code === "BEMO_BAD_CREDENTIALS");
});
