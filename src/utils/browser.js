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
 * @param {number} [options.timeout=30000] - Navigation timeout
 * @param {boolean} [options.waitForList=false] - Wait until an Odoo list view has rendered its rows
 * @throws {Error} If not logged in
 */
async function navigateWithAuth(page, url, options = {}) {
  const { timeout = 30000, waitForList = false } = options;

  await page.goto(url, { waitUntil: "networkidle2", timeout });

  if (page.url().includes("/login")) {
    logger.notLoggedIn();
  }

  if (waitForList) await waitForListLoaded(page);
}

/**
 * Wait until an Odoo list view shows data rows or its empty-state helper.
 * networkidle2 fires before Odoo renders the rows, so this replaces fixed sleeps.
 * @param {Page} page - Puppeteer page
 * @param {number} timeout - Max wait in ms
 * @returns {Promise<boolean>} False if nothing rendered in time (e.g. empty list without helper)
 */
async function waitForListLoaded(page, timeout = 15000) {
  try {
    await page.waitForFunction(
      () => document.querySelector("table tbody tr.o_data_row") || document.querySelector(".o_view_nocontent"),
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Signature of the visible list page, used to detect that a reload replaced the rows.
 * @param {Page} page - Puppeteer page
 * @returns {Promise<string>}
 */
async function getListSignature(page) {
  return page.evaluate(() => {
    const pager = document.querySelector(".o_pager_value")?.textContent.trim() || "";
    const rows = Array.from(document.querySelectorAll("table tbody tr.o_data_row"));
    return `${pager}|${rows.length}|${rows[0]?.textContent || ""}|${rows.at(-1)?.textContent || ""}`;
  });
}

/**
 * Run an action that makes Odoo reload the list (filter, pager...) and wait for the new rows.
 * @param {Page} page - Puppeteer page
 * @param {function} action - Async action triggering the reload
 * @param {Object} options - Wait options
 * @param {number} [options.timeout=15000] - Max wait for the search_read response
 * @returns {Promise<*>} Result of the action
 */
async function withListReload(page, action, options = {}) {
  const { timeout = 15000 } = options;
  const before = await getListSignature(page);
  const response = page.waitForResponse((res) => res.url().includes("/web/dataset/search_read"), { timeout });
  // Avoid an unhandled rejection if the action throws before we await the response.
  response.catch(() => {});

  const result = await action();
  await response;

  try {
    await page.waitForFunction(
      (previous) => {
        const pager = document.querySelector(".o_pager_value")?.textContent.trim() || "";
        const rows = Array.from(document.querySelectorAll("table tbody tr.o_data_row"));
        const current = `${pager}|${rows.length}|${rows[0]?.textContent || ""}|${rows.at(-1)?.textContent || ""}`;
        return current !== previous;
      },
      { timeout: 5000 },
      before,
    );
  } catch {
    // Same data before and after (e.g. identical result set): nothing to wait for.
  }

  return result;
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
  waitForListLoaded,
  withListReload,
  sleep,
  clickButtonByText,
  extractTableData,
  closeBrowser,
  withBrowser,
};
