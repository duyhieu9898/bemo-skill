#!/usr/bin/env node
/**
 * Login - Open browser for manual login
 */

const CONFIG = require("../shared/config");
const { loginLogger: log, baseLog } = require("../shared");
const { createBrowser, closeBrowser, sleep } = require("./launch");
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env"), quiet: true });

const TIMEOUT = {
  navigation: 30000,
  login: 120000,
  afterLogin: 2000,
};

/**
 * Check if currently on login page
 * @param {import("puppeteer-core").Page} page - Puppeteer page
 * @returns {boolean}
 */
function isOnLoginPage(page) {
  return page.url().includes("/login");
}

/**
 * Main login function
 */
async function login() {
  log.header();

  const browser = await createBrowser(CONFIG, true); 
  const page = await browser.newPage();

  try {
    // Check the session first: when already logged in, Bemo's login page shows a blocking
    // "validateLogged" modal and the form cannot be submitted. /web redirects to /login only without a session.
    await page.goto(CONFIG.urls.login.replace(/\/web\/login$/, "/web"), {
      waitUntil: "networkidle2",
      timeout: TIMEOUT.navigation,
    });

    if (!isOnLoginPage(page)) {
      log.alreadyLoggedIn();
      await closeBrowser(browser);
      return;
    }

    const bemoUser = process.env.BEMO_USER || process.env.BEMO_EMAIL;
    const bemoPass = process.env.BEMO_PASS || process.env.BEMO_PASSWORD;

    if (bemoUser && bemoPass) {
      baseLog.info("Attempting auto-login...");
      await page.waitForSelector('input[name="login"]', { timeout: 10000 });
      await page.type('input[name="login"]', bemoUser);
      await page.type('input[name="password"]', bemoPass);
      // Submitting always navigates (to /web on success, back to /login on bad credentials).
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: TIMEOUT.navigation }),
        page.click('button[type="submit"]'),
      ]);
    }

    if (!isOnLoginPage(page)) {
      log.alreadyLoggedIn();
      await closeBrowser(browser);
      return;
    }

    log.pleaseLogin();

    // Wait for user to complete login
    await page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: TIMEOUT.login,
    });

    log.success(CONFIG.userDataDir);

    await sleep(TIMEOUT.afterLogin);
    await closeBrowser(browser);
  } catch (err) {
    log.error(err);
    await closeBrowser(browser);
    process.exit(1);
  }
}

// CLI entry point
if (require.main === module) {
  login();
}

module.exports = { login };
