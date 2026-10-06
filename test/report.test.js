const test = require("node:test");
const assert = require("node:assert/strict");

const { say, friendlyError } = require("../src/shared/report");
const { bemoError } = require("../src/shared/errors");

test("say prefixes every line with the summary mark", (t) => {
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(line));
  say("một\nhai");
  assert.deepEqual(lines, ["» một", "» hai"]);
});

test("common failures become one Vietnamese line with the next step", () => {
  assert.equal(friendlyError(bemoError("Not logged in to Bemo", "BEMO_NOT_LOGGED_IN")), "🔐 Hết phiên đăng nhập Bemo → /bemo_login");
  assert.equal(friendlyError(new Error("Not logged in to Bemo (x)")), "🔐 Hết phiên đăng nhập Bemo → /bemo_login");
  assert.equal(friendlyError(bemoError("Sai tài khoản hoặc mật khẩu Bemo", "BEMO_BAD_CREDENTIALS")), "🔑 Sai BEMO_USER/BEMO_PASS trong .env");
  assert.equal(friendlyError(new Error("fetch failed")), "🌐 Không kết nối được Bemo (mạng?)");
  assert.equal(friendlyError(Object.assign(new Error("x"), { code: "ENOTFOUND" })), "🌐 Không kết nối được Bemo (mạng?)");
  assert.equal(friendlyError(new Error("Failed to launch the browser process!")), "🧭 Không mở được Chrome (PUPPETEER_EXECUTABLE_PATH?)");
});

test("other errors keep their first line, shortened", () => {
  assert.equal(friendlyError(new Error("boom\nstack")), "❌ boom");
  assert.equal(friendlyError("plain").startsWith("❌ plain"), true);
  assert.equal(friendlyError(new Error("x".repeat(300))).length, 202);
});
