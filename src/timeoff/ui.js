/**
 * UI interaction helpers for Bemo/Odoo Time Off
 */

const { sleep, debugLog: _debugLog } = require("../utils");
const debugLog = (action, data) => _debugLog("create-timeoff.json", action, data);


/**
 * Open time off type dropdown and extract available types
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Available leave types with remaining hours
 */
async function getLeaveTypes(page) {
  debugLog("getLeaveTypes_start");

  // Click dropdown to open
  await page.evaluate(() => {
    const dropdown = document.querySelector("input.o_input.ui-autocomplete-input");
    if (dropdown) {
      dropdown.click();
      dropdown.focus();
    }
  });

  // Wait for dropdown menu items to appear
  try {
    await page.waitForSelector(".ui-menu-item", { visible: true, timeout: 5000 });
  } catch (err) {
    debugLog("getLeaveTypes_warning", { message: "Dropdown menu items did not appear within timeout" });
  }

  // Extract leave types
  const result = await page.evaluate(() => {
    const items = document.querySelectorAll(".ui-menu.ui-widget.ui-autocomplete li, .ui-menu-item");
    const types = [];
    const rawItems = [];

    items.forEach((item) => {
      const text = item.textContent || "";
      rawItems.push(text);
      const match = text.match(/(.+?)\s*\(([\d.]+)\s*remaining/i);
      if (match) {
        types.push({
          name: match[1].trim(),
          remaining: parseFloat(match[2]),
          fullText: text,
        });
      }
    });

    return { types, rawItems };
  });

  debugLog("getLeaveTypes_end", {
    foundCount: result.types.length,
    rawItems: result.rawItems,
    extractedTypes: result.types,
  });

  return result.types;
}

/**
 * Select a leave type from dropdown
 * @param {Page} page - Puppeteer page
 * @param {string} typeName - Leave type name to select
 * @returns {Promise<boolean>}
 */
async function selectLeaveType(page, typeName) {
  debugLog("selectLeaveType_start", { typeName });

  // First, make sure the dropdown is still open
  await page.evaluate(() => {
    const dropdown = document.querySelector("input.o_input.ui-autocomplete-input");
    if (dropdown) {
      dropdown.click();
      dropdown.focus();
    }
  });

  try {
    await page.waitForSelector(".ui-menu-item", { visible: true, timeout: 5000 });
  } catch (err) {
    debugLog("selectLeaveType_dropdown_warning", { message: "Dropdown menu items did not appear" });
  }

  const selected = await page.evaluate((name) => {
    const items = document.querySelectorAll(".ui-menu-item, .ui-autocomplete li");

    for (const item of items) {
      const text = item.textContent || "";
      if (text.trim().startsWith(name)) {
        const link = item.querySelector("a");
        if (link) {
          link.click();
        } else {
          item.click();
        }
        return { success: true, clickedText: text.substring(0, 60) };
      }
    }

    for (const item of items) {
      const text = item.textContent || "";
      if (text.includes(name)) {
        const link = item.querySelector("a");
        if (link) {
          link.click();
        } else {
          item.click();
        }
        return { success: true, clickedText: text.substring(0, 60), fallback: true };
      }
    }

    return {
      success: false,
      availableItems: Array.from(items)
        .map((i) => i.textContent?.substring(0, 40))
        .slice(0, 5),
    };
  }, typeName);

  debugLog("selectLeaveType_action", { selected });

  // Wait for the input to potentially update or dropdown to close
  try {
    await page.waitForFunction(
      (name) => {
        const input = document.querySelector("input.o_input.ui-autocomplete-input");
        return input && input.value.includes(name.split(" ")[0]);
      },
      { timeout: 3000 },
      typeName,
    );
  } catch (err) {
    debugLog("selectLeaveType_timeout", { message: "Input did not update in time" });
  }

  return selected.success;
}

/**
 * Verify time off was actually created by checking the list
 * @param {Page} page - Puppeteer page
 * @param {string} date - Date to check (DD/MM/YYYY format)
 * @param {string} listUrl - URL to time off list
 * @returns {Promise<boolean>} True if found
 */
async function verifyTimeOffExists(page, date, listUrl) {
  // Navigate to time off list
  await page.goto(listUrl, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  
  try {
    await page.waitForSelector("table tbody tr.o_data_row", { timeout: 10000 });
  } catch (err) {
    debugLog("verifyTimeOffExists_timeout", { message: "Table rows did not appear" });
  }

  const found = await page.evaluate((targetDate) => {
    const rows = document.querySelectorAll("table tbody tr.o_data_row");
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map((c) => c.textContent);
      if (cells.some((cell) => cell.includes(targetDate))) {
        return true;
      }
    }
    return false;
  }, date);

  return found;
}

module.exports = {
  getLeaveTypes,
  selectLeaveType,
  verifyTimeOffExists,
};
