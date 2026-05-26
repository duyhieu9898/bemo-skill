/**
 * Form interaction helpers for Bemo/Odoo Time Off
 */

const { sleep, debugLog: _debugLog } = require("../utils");
const debugLog = (action, data) => _debugLog("create-timeoff.json", action, data);

/**
 * Fill the time off form
 * @param {Page} page - Puppeteer page
 * @param {string} startDateTime - Start date time
 * @param {string} endDateTime - End date time
 * @param {string} reason - Reason text
 * @returns {Promise<Object>} Fill result
 */
async function fillTimeOffForm(page, startDateTime, endDateTime, reason) {
  const result = await page.evaluate(
    (start, end, reasonText) => {
      const inputs = document.querySelectorAll("input.o_datepicker_input.o_input.datetimepicker-input");
      const filled = { start: false, end: false, reason: false, totalInputs: inputs.length };

      if (inputs[1]) {
        inputs[1].focus();
        inputs[1].value = end;
        inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
        inputs[1].dispatchEvent(new Event("change", { bubbles: true }));
        filled.end = true;
      }

      if (inputs[0]) {
        inputs[0].focus();
        inputs[0].value = start;
        inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
        inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
        filled.start = true;
      }

      const textarea = document.querySelector("textarea, input[name*='description']");
      if (textarea) {
        textarea.focus();
        textarea.value = reasonText;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        filled.reason = true;
      }

      return filled;
    },
    startDateTime,
    endDateTime,
    reason,
  );

  // Wait for duration to be calculated (it's usually triggered by change events)
  try {
    await page.waitForFunction(
      () => {
        const durationField = document.querySelector(".o_field_integer.o_field_number.o_field_widget.o_readonly_modifier");
        return durationField && durationField.textContent.trim() !== "" && durationField.textContent.trim() !== "0";
      },
      { timeout: 5000 }
    );
  } catch (err) {
    debugLog("form_fill_duration_wait_timeout", { message: "Duration field didn't update" });
  }

  return result;
}

/**
 * Validate duration field
 * @param {Page} page - Puppeteer page
 * @param {number} expectedMinutes - Expected duration in minutes
 * @param {number} maxMinutes - Maximum allowed minutes
 * @returns {Promise<Object>} Validation result
 */
async function validateDuration(page, expectedMinutes, maxMinutes) {
  return page.evaluate(
    (expected, max) => {
      const durationFields = document.querySelectorAll(
        ".o_field_integer.o_field_number.o_field_widget.o_readonly_modifier",
      );

      if (durationFields.length === 0) {
        return { found: false, message: "Duration field not found" };
      }

      const actualValue = durationFields[0].textContent?.trim() || "";
      const actualMinutes = parseInt(actualValue.replace(/\D/g, "")) || 0;

      return {
        found: true,
        actualValue,
        actualMinutes,
        expectedMinutes: expected,
        isUnderMax: actualMinutes <= max,
        matchesExpected: actualMinutes === expected,
        isValid: actualMinutes === expected && actualMinutes <= max,
      };
    },
    expectedMinutes,
    maxMinutes,
  );
}

module.exports = {
  fillTimeOffForm,
  validateDuration,
};
