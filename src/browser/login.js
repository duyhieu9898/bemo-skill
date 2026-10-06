/**
 * Login - headless Bemo login with BEMO_USER/BEMO_PASS from .env
 */

const CONFIG = require("../shared/config");
const { loginLogger: log, baseLog } = require("../shared");
const { createBrowser, closeBrowser, sleep } = require("./launch");
const { bemoError } = require("../shared/errors");
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env"), quiet: true });

const TIMEOUT = {
  navigation: 30000,
  afterLogin: 2000,
};

/**
 * Check if current page is login page
 * @param {import("puppeteer-core").Page} page
 * @returns {boolean}
 */
function isOnLoginPage(page) {
  return page.url().includes("/login");
}

/**
 * @param {Record<string, string|undefined>} env
 * @returns {{user: string, pass: string}}
 */
function requireCredentials(env) {
  const user = env.BEMO_USER || env.BEMO_EMAIL;
  const pass = env.BEMO_PASS || env.BEMO_PASSWORD;
  if (!user || !pass) throw new Error("Thiếu BEMO_USER/BEMO_PASS trong .env");
  return { user, pass };
}

/**
 * @param {boolean} stillOnLoginPage - After submitting the form
 * @returns {"logged-in"}
 */
function submitOutcome(stillOnLoginPage) {
  if (stillOnLoginPage) throw bemoError("Sai tài khoản hoặc mật khẩu Bemo", "BEMO_BAD_CREDENTIALS");
  return "logged-in";
}

/**
 * Log in headless with .env credentials; the session lives in the Chrome profile
 * @returns {Promise<"already"|"logged-in">}
 */
async function login() {
  log.header();
  const browser = await createBrowser(CONFIG, true);
  try {
    const page = await browser.newPage();
    // /web redirects to /login only without a session.
    await page.goto(CONFIG.urls.login.replace(/\/web\/login$/, "/web"), {
      waitUntil: "networkidle2",
      timeout: TIMEOUT.navigation,
    });
    if (!isOnLoginPage(page)) {
      log.alreadyLoggedIn();
      return "already";
    }
    const { user, pass } = requireCredentials(process.env);
    baseLog.info("Attempting auto-login...");
    await page.waitForSelector('input[name="login"]', { timeout: 10000 });
    await page.type('input[name="login"]', user);
    await page.type('input[name="password"]', pass);
    // Submitting always navigates (to /web on success, back to /login on bad credentials).
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: TIMEOUT.navigation }),
      page.click('button[type="submit"]'),
    ]);
    const outcome = submitOutcome(isOnLoginPage(page));
    log.success(CONFIG.userDataDir);
    await sleep(TIMEOUT.afterLogin);
    return outcome;
  } finally {
    await closeBrowser(browser);
  }
}

module.exports = { login, requireCredentials, submitOutcome };
