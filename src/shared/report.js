/**
 * Human-facing output: lines starting with "» " are what the Telegram bot and the cron message show.
 * Everything else a command prints stays a log line.
 */

const MARK = "» ";

/** @param {string} text */
function say(text) {
  for (const line of String(text).split("\n")) console.log(`${MARK}${line}`);
}

/** @type {Array<[(e: Error & {code?: string}) => boolean, string]>} */
const RULES = [
  [(e) => e.code === "BEMO_NOT_LOGGED_IN" || /Not logged in/i.test(e.message), "🔐 Hết phiên đăng nhập Bemo → /bemo_login"],
  [(e) => e.code === "BEMO_NOT_CONFIGURED", "⚙️ Thiếu BEMO_SUBDOMAIN (hoặc BEMO_BASE_URL) trong skills/bemo/.env"],
  [(e) => e.code === "BEMO_BAD_CREDENTIALS", "🔑 Sai BEMO_USER/BEMO_PASS trong .env"],
  [(e) => /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed/.test(`${e.code || ""} ${e.message}`), "🌐 Không kết nối được Bemo (mạng?)"],
  [(e) => /Could not find Chrome|Failed to launch the browser|executablePath/i.test(e.message), "🧭 Không mở được Chrome (PUPPETEER_EXECUTABLE_PATH?)"],
];

/**
 * @param {unknown} err
 * @returns {string}
 */
function friendlyError(err) {
  const e = err instanceof Error ? err : new Error(String(err));
  const hit = RULES.find(([matches]) => matches(e));
  return hit ? hit[1] : `❌ ${e.message.split("\n")[0].slice(0, 200)}`;
}

/**
 * Log the raw error, print the friendly line, exit 1
 * @param {unknown} err
 * @returns {never}
 */
function fail(err) {
  console.error("❌", err instanceof Error ? err.message : String(err));
  say(friendlyError(err));
  process.exit(1);
}

module.exports = { MARK, say, friendlyError, fail };
