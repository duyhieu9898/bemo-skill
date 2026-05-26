/**
 * Browser utilities - Common Puppeteer helpers
 */

const puppeteer = require("puppeteer-core");
const { dataLogger: logger } = require("./logger");

/**
 * Create a new browser instance
 * @param {Object} config - Config object with getLaunchOptions method
 * @param {boolean} headless - Run in headless mode
 * @returns {Promise<Browser>}
 */
async function createBrowser(config, headless = true) {
  return puppeteer.launch(config.getLaunchOptions(headless));
}

/**
 * Navigate to URL and check login status
 * @param {Page} page - Puppeteer page
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 * @throws {Error} If not logged in
 */
async function navigateWithAuth(page, url, options = {}) {
  const { timeout = 30000, waitTime = 3000 } = options;

  await page.goto(url, { waitUntil: "networkidle2", timeout });

  if (page.url().includes("/login")) {
    logger.notLoggedIn();
  }

  await sleep(waitTime);
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
 * Click button by text content
 * @param {Page} page - Puppeteer page
 * @param {string} text - Text to search for
 * @returns {Promise<boolean>}
 */
async function clickButtonByText(page, text) {
  return page.evaluate((searchText) => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent.toLowerCase().includes(searchText.toLowerCase()),
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, text);
}

/**
 * Extract table data from page
 * @param {Page} page - Puppeteer page
 * @param {string} selector - Table row selector
 * @param {function} rowParser - Function to parse each row
 * @returns {Promise<Array>}
 */
async function extractTableData(page, selector, rowParser) {
  return page.evaluate((sel, parserFn) => {
    const rows = document.querySelectorAll(sel);
    return Array.from(rows).map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent.trim());
      return cells;
    });
  }, selector);
}

/**
 * Safe browser cleanup
 * @param {Browser} browser - Puppeteer browser instance
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
  clickButtonByText,
  extractTableData,
  closeBrowser,
  withBrowser,
};
