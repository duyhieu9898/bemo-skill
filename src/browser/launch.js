/**
 * Browser utilities - Common Puppeteer helpers
 */

const puppeteer = require("puppeteer-core");
const { dataLogger: logger } = require("../shared/logger");

/**
 * Create a new browser instance
 * @param {Object} config - Config object with getLaunchOptions method
 * @param {boolean} headless - Run in headless mode
 * @returns {Promise<import("puppeteer-core").Browser>}
 */
async function createBrowser(config, headless = true) {
  return puppeteer.launch(config.getLaunchOptions(headless));
}

/**
 * Navigate to URL and check login status
 * @param {import("puppeteer-core").Page} page - Puppeteer page
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @param {number} [options.timeout=30000] - Navigation timeout
 * @throws {Error} If not logged in
 */
async function navigateWithAuth(page, url, options = {}) {
  const { timeout = 30000 } = options;

  await page.goto(url, { waitUntil: "networkidle2", timeout });

  if (page.url().includes("/login")) {
    logger.notLoggedIn();
  }
}

/**
 * Sleep helper
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe browser cleanup
 * @param {import("puppeteer-core").Browser} browser - Puppeteer browser instance
 */
async function closeBrowser(browser) {
  try {
    if (browser) {
      await browser.close();
    }
  } catch {
    // Ignore close errors
  }
}

/**
 * Run a browser task with automatic cleanup
 * @param {Object} config - Config object
 * @param {boolean} headless - Run in headless mode
 * @param {function} task - Async function(page) to execute
 * @returns {Promise<*>} Result from task
 */
async function withBrowser(config, headless, task) {
  const browser = await createBrowser(config, headless);
  const page = await browser.newPage();

  try {
    return await task(page, browser);
  } finally {
    await closeBrowser(browser);
  }
}

module.exports = {
  createBrowser,
  navigateWithAuth,
  sleep,
  closeBrowser,
  withBrowser,
};
