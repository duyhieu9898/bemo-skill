#!/usr/bin/env node
/**
 * Get Attendance - Fetch attendance records from Bemo
 */

const CONFIG = require("./config");
const {
  withBrowser,
  navigateWithAuth,
  withListReload,
  saveJSON,
  createDataWrapper,
  parseTimeToMinutes,
  extractDateFromDateTime,
  dataLogger,
} = require("./utils");
const { connect } = require("./rpc/client");
const { fetchAttendance } = require("./rpc/sync");

const OUTPUT_FILE = CONFIG.dataFiles.attendance;
const { checkIn: CHECK_IN_COL, late: LATE_COL } = CONFIG.columns.attendance;
const DEFAULT_MONTH_FILTER = CONFIG.attendanceFilters.default;


/**
 * Parse attendance row cells to record
 * @param {Array<string>} cells - Table row cells
 * @returns {Object|null} Attendance record or null if invalid
 */
function parseAttendanceRow(cells) {
  const checkIn = cells[CHECK_IN_COL] || "";
  const late = cells[LATE_COL] || "";

  // Validate check-in date format
  if (!checkIn || !checkIn.match(/\d{2}\/\d{2}\/\d{4}/)) {
    return null;
  }

  return {
    date: extractDateFromDateTime(checkIn),
    checkInDateTime: checkIn,
    late,
    lateMinutes: parseTimeToMinutes(late),
  };
}

/**
 * Extract attendance records from page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Attendance records
 */
async function extractAttendanceRecords(page) {
  const rawData = await page.evaluate(() => {
    const rows = document.querySelectorAll("table tbody tr.o_data_row");
    return Array.from(rows).map((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((c) =>
        c.textContent.trim()
      );
      return cells;
    });
  });

  return rawData.map(parseAttendanceRow).filter(Boolean);
}

/**
 * Get active Odoo search facets from the page
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array<string>>} Active facet labels
 */
async function getActiveSearchFacets(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".o_facet_value"))
      .map((facet) => facet.textContent.trim())
      .filter(Boolean)
  );
}

/**
 * Remove an active Odoo search facet by label
 * @param {Page} page - Puppeteer page
 * @param {string} label - Facet label
 * @returns {Promise<boolean>} Whether a facet was removed
 */
async function removeSearchFacet(page, label) {
  return page.evaluate((targetLabel) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const target = normalize(targetLabel);
    const facets = Array.from(document.querySelectorAll(".o_searchview_facet, .o_facet"));

    for (const facet of facets) {
      const value = facet.querySelector(".o_facet_value");
      if (!value || normalize(value.textContent) !== target) continue;

      const remove = facet.querySelector(".o_facet_remove, .fa-times, .oi-close");
      if (remove) {
        remove.click();
        return true;
      }

      facet.remove();
      return true;
    }

    return false;
  }, label);
}

/**
 * Open Odoo search/filter dropdown
 * @param {Page} page - Puppeteer page
 * @returns {Promise<boolean>} Whether the dropdown was opened
 */
async function openSearchFilterMenu(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const selectors = [
      ".o_searchview_dropdown_toggler",
      ".o_searchview_dropdown_toggler button",
      ".o_cp_searchview button",
      ".o_search_options button",
      "button.dropdown-toggle",
    ];

    const buttons = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const button =
      buttons.find((element) => isVisible(element) && /filter|search/i.test(element.textContent)) ||
      buttons.find(isVisible);

    if (!button) return false;
    button.click();
    return true;
  });
}

/**
 * Click an Odoo filter menu item by label
 * @param {Page} page - Puppeteer page
 * @param {string} label - Filter label
 * @returns {Promise<boolean>} Whether the item was clicked
 */
async function clickFilterMenuItem(page, label) {
  return page.evaluate((targetLabel) => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
    const target = normalize(targetLabel);
    const isVisible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(
      document.querySelectorAll(".dropdown-menu a, .dropdown-menu button, .dropdown-menu label, .o_search_options a, .o_search_options button, .o_search_options label")
    );
    const item = candidates.find((element) => isVisible(element) && normalize(element.textContent) === target);

    if (!item) return false;
    item.click();
    return true;
  }, label);
}

/**
 * Select month filter on attendance list before scraping
 * @param {Page} page - Puppeteer page
 * @param {string} monthFilter - Odoo filter label
 * @returns {Promise<void>}
 */
async function selectAttendanceMonthFilter(page, monthFilter = DEFAULT_MONTH_FILTER) {
  const activeFacets = await getActiveSearchFacets(page);
  if (activeFacets.includes(monthFilter)) return;

  if (activeFacets.includes(CONFIG.attendanceFilters.current)) {
    await withListReload(page, () => removeSearchFacet(page, CONFIG.attendanceFilters.current));
  }

  const opened = await openSearchFilterMenu(page);
  if (!opened) {
    throw new Error("Could not open attendance search filter menu");
  }

  // Wait for the dropdown item instead of a fixed delay, then click it and wait for the reloaded rows.
  try {
    await page.waitForFunction(
      (label) =>
        Array.from(document.querySelectorAll(".dropdown-menu a, .dropdown-menu button, .dropdown-menu label, .o_search_options a, .o_search_options button, .o_search_options label"))
          .some((el) => el.offsetParent && el.textContent.replace(/\s+/g, " ").trim().toLowerCase() === label.toLowerCase()),
      { timeout: 5000 },
      monthFilter,
    );
  } catch {
    throw new Error(`Could not find attendance filter: ${monthFilter}`);
  }

  await withListReload(page, () => clickFilterMenuItem(page, monthFilter));

  const updatedFacets = await getActiveSearchFacets(page);
  if (!updatedFacets.includes(monthFilter)) {
    throw new Error(`Attendance filter was not applied: ${monthFilter}`);
  }
}

/**
 * Read attendance by scraping the list view (fallback engine)
 */
async function readAttendanceFromBrowser(headless, monthFilter) {
  return withBrowser(CONFIG, headless, async (page) => {
    await navigateWithAuth(page, CONFIG.urls.attendances, { waitForList: true });
    await selectAttendanceMonthFilter(page, monthFilter);
    return extractAttendanceRecords(page);
  });
}

/**
 * Read attendance through Odoo JSON-RPC (default engine)
 */
async function readAttendanceFromApi(monthFilter) {
  const now = new Date();
  const offset = monthFilter === CONFIG.attendanceFilters.previous ? -1 : 0;
  const conn = await connect();
  return fetchAttendance(conn, { year: now.getFullYear(), monthIndex: now.getMonth() + offset });
}

/**
 * Main function to get attendance records
 * @param {boolean} headless - Run in headless mode (browser engine only)
 * @param {string} monthFilter - Odoo attendance month filter label
 * @param {Object} options - Options
 * @param {"api"|"browser"} [options.engine="api"] - Data source
 * @returns {Promise<Array>} Processed records
 */
async function getAttendance(headless = true, monthFilter = DEFAULT_MONTH_FILTER, { engine = "api" } = {}) {
  const records =
    engine === "browser" ? await readAttendanceFromBrowser(headless, monthFilter) : await readAttendanceFromApi(monthFilter);

  saveJSON(OUTPUT_FILE, createDataWrapper(records));
  dataLogger.saved(records.length, "data/attendance-data.json");

  return records;
}

// CLI entry point
if (require.main === module) {
  const headless = !process.argv.includes("--show");
  const monthFilter = process.argv.includes("--previous") ? CONFIG.attendanceFilters.previous : DEFAULT_MONTH_FILTER;
  
  const engine = process.argv.includes("--browser") ? "browser" : "api";

  getAttendance(headless, monthFilter, { engine }).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = {
  getAttendance,
  selectAttendanceMonthFilter,
};
