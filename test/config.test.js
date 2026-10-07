const test = require("node:test");
const assert = require("node:assert/strict");

const { getBaseUrl, assertConfigured } = require("../src/shared/config");
const { friendlyError } = require("../src/shared/report");

test("the Bemo address comes only from the environment", () => {
  assert.equal(getBaseUrl({ BEMO_SUBDOMAIN: "acme" }), "https://acme.bemo-cloud.com");
  assert.equal(getBaseUrl({ BEMO_BASE_URL: "https://hr.example.com/", BEMO_SUBDOMAIN: "acme" }), "https://hr.example.com");
  assert.equal(getBaseUrl({}), null);
});

test("using Bemo without an address fails with the setting to add", () => {
  assert.throws(() => assertConfigured(null), (err) => err.code === "BEMO_NOT_CONFIGURED");
  assert.doesNotThrow(() => assertConfigured("https://acme.bemo-cloud.com"));
  let err;
  try {
    assertConfigured(null);
  } catch (e) {
    err = e;
  }
  assert.equal(friendlyError(err), "⚙️ Thiếu BEMO_SUBDOMAIN (hoặc BEMO_BASE_URL) trong skills/bemo/.env");
});
