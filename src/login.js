#!/usr/bin/env node
/**
 * Login - Open browser for manual login
 */

const CONFIG = require("./config");
const { createBrowser, closeBrowser, sleep, loginLogger: log, baseLog } = require("./utils");
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const TIMEOUT = {
  navigation: 30000,
  login: 120000,
  afterLogin: 2000,
};

/**
 * Check if currently on login page
 * @param {Page} page - Puppeteer page
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
    await page.goto(CONFIG.urls.login, {
      waitUntil: "networkidle2",
      timeout: TIMEOUT.navigation,
    });

    const bemoUser = process.env.BEMO_USER || process.env.BEMO_EMAIL;
    const bemoPass = process.env.BEMO_PASS || process.env.BEMO_PASSWORD;

    if (bemoUser && bemoPass) {
      baseLog.info("Attempting auto-login...");
      await page.waitForSelector('input[name="login"]', { timeout: 10000 });
      await page.type('input[name="login"]', bemoUser);
      await page.type('input[name="password"]', bemoPass);
      await page.click('button[type="submit"]');
      await sleep(10000);
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
