#!/usr/bin/env node
/**
 * Create Time Off - Automated time off request creation
 * Refactored version using sub-modules
 */

const CONFIG = require("./config");
const {
  withBrowser,
  sleep,
  clickButtonByText,
  loadJSON,
  loadRecords,
  saveJSON,
  createDataWrapper,
  extractTimeFromDateTime,
  createTimeOffLogger: log,
  debugLog: _debugLog,
} = require("./utils");

// Sub-modules
const { getLeaveTypes, selectLeaveType, verifyTimeOffExists } = require("./timeoff/ui");
const { fillTimeOffForm, validateDuration } = require("./timeoff/form");
const { findSuitableLeaveType, updateSessionLeaveCache } = require("./timeoff/logic");

/**
 * Wrapper for debug logging in this module
 */
const debugLog = (action, data) => _debugLog("create-timeoff.json", action, data);

const ACTION_FILE = CONFIG.dataFiles.actionNeeded;
const LEAVE_TYPES_FILE = CONFIG.dataFiles.leaveTypes;

/**
 * In-memory cache for leave types during a single session
 */
let sessionLeaveTypes = null;

// Timing constants
const TIMING = {
  manualSave: 120000,
};

/**
 * Orchestrate leave balance check and selection
 * @param {Page} page - Puppeteer page
 * @param {number} requiredMinutes - Required minutes
 * @param {boolean} forceRefresh - Ignore cache and fetch fresh data
 * @returns {Promise<Object>} Selected leave type
 */
async function checkLeaveBalance(page, requiredMinutes, forceRefresh = false) {
  const requiredHours = Math.ceil((requiredMinutes / 60) * 100) / 100;
  debugLog("checkLeaveBalance_start", { requiredHours, requiredMinutes, forceRefresh });

  if (!sessionLeaveTypes || forceRefresh) {
    debugLog("fetching_fresh_leave_types");
    sessionLeaveTypes = await getLeaveTypes(page);
    saveJSON(LEAVE_TYPES_FILE, createDataWrapper(sessionLeaveTypes, { count: sessionLeaveTypes.length }));
  } else {
    debugLog("using_cached_leave_types");
  }

  log.leaveTypes(sessionLeaveTypes);

  // Use logic module to find suitable type
  const suitableType = findSuitableLeaveType(sessionLeaveTypes, requiredHours);

  // Use UI module to select it
  await selectLeaveType(page, suitableType.name);
  log.selectedType(suitableType);

  return suitableType;
}

/**
 * Update action-needed.json to remove processed records
 * @param {Array<string>} processedDates - Dates that were successfully processed
 */
function updateActionFile(processedDates) {
  const records = loadRecords(ACTION_FILE);
  const remaining = records.filter((r) => !processedDates.includes(r.date));

  const data = createDataWrapper(remaining, { count: remaining.length });
  saveJSON(ACTION_FILE, data);

  if (remaining.length > 0) {
    log.durationWarning(`${remaining.length} records remaining in action-needed.json`);
  }
}

/**
 * Create a single time off request
 * @param {Page} page - Puppeteer page
 * @param {Object} record - Record to process
 * @param {boolean} manual - Manual mode (user clicks save)
 * @param {boolean} skipVerify - Skip per-record verification
 * @returns {Promise<Object|null>} Created record or null if skipped
 */
async function createOne(page, record, manual = false, skipVerify = false) {
  const { date, checkInDateTime, lateMinutes, reason: recordReason } = record;
  const checkInTime = extractTimeFromDateTime(checkInDateTime);
  const requiredHours = lateMinutes / 60;

  log.createStart(date, checkInTime, lateMinutes, requiredHours, CONFIG.rules.workStartTime);
  debugLog("createOne_start", { date, lateMinutes, requiredHours, skipVerify });

  // Navigate to create page
  await page.goto(CONFIG.urls.timeoffCreate, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  // Wait for the New button and click it
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(b => b.textContent.toLowerCase().includes("new")),
      { timeout: 10000 }
    );
    await clickButtonByText(page, "new");
    await page.waitForSelector("input.o_input.ui-autocomplete-input", { visible: true, timeout: 5000 });
  } catch (err) {
    debugLog("createOne_navigation_error", { message: "Could not find 'New' button or form did not load", error: err.message });
    throw new Error("Creation form failed to load");
  }

  // Check and select leave type
  let usedLeaveType;
  try {
    usedLeaveType = await checkLeaveBalance(page, lateMinutes);
  } catch (err) {
    debugLog("createOne_skipping", { date, error: err.message });
    log.skipping(err.message);
    return null;
  }

  // Prepare form data
  const startDateTime = `${date} ${CONFIG.rules.workStartTime}:00`;
  const endDateTime = `${date} ${checkInTime}:00`;
  const reason = recordReason || CONFIG.rules.defaultReason;

  // Fill form
  const fillResult = await fillTimeOffForm(page, startDateTime, endDateTime, reason);
  log.fillResult(fillResult);

  if (!fillResult.start || !fillResult.end) {
    throw new Error(`Form fill failed: start=${fillResult.start}, end=${fillResult.end}`);
  }

  // Validate duration
  const durationValidation = await validateDuration(page, lateMinutes, CONFIG.rules.maxLateMinutes);

  if (!durationValidation.found) {
    log.durationWarning(`Could not validate duration field: ${durationValidation.message}`);
  } else if (!durationValidation.isValid) {
    const errors = [];
    if (!durationValidation.isUnderMax) {
      errors.push(`Duration ${durationValidation.actualMinutes} mins > ${CONFIG.rules.maxLateMinutes} mins limit`);
    }
    if (!durationValidation.matchesExpected) {
      errors.push(`Expected ${lateMinutes} mins but got ${durationValidation.actualMinutes} mins`);
    }
    throw new Error(`Duration validation failed: ${errors.join("; ")}`);
  } else {
    log.durationValid(durationValidation.actualMinutes);
  }

  // Double-check form values before save
  const formValues = await page.evaluate(() => {
    const inputs = document.querySelectorAll("input.o_datepicker_input.o_input.datetimepicker-input");
    return {
      startValue: inputs[0]?.value || "",
      endValue: inputs[1]?.value || "",
    };
  });

  if (!formValues.startValue.includes(date) || !formValues.endValue.includes(date)) {
    throw new Error(`Form date mismatch: Expected ${date}, got start="${formValues.startValue}", end="${formValues.endValue}"`);
  }

  // Save
  if (manual) {
    log.manualMode();
    await sleep(TIMING.manualSave);
  } else {
    log.autoSaving();
    await clickButtonByText(page, "save");
    
    try {
      await page.waitForFunction(() => !document.querySelector("button.o_form_button_save"), { timeout: 10000 });
    } catch (err) {
      debugLog("autoSave_timeout", { message: "Save button still present after 10s" });
    }

    if (!skipVerify) {
      log.verifying();
      const exists = await verifyTimeOffExists(page, date, CONFIG.urls.timeoffList);
      if (!exists) {
        throw new Error(`Verification failed: Time off for ${date} not found in list after save`);
      }
      log.verified();
    } else {
      await sleep(1000);
    }
  }

  // Update memory cache after success
  if (!manual && usedLeaveType) {
    sessionLeaveTypes = updateSessionLeaveCache(sessionLeaveTypes, usedLeaveType.name, lateMinutes);
  }

  return { date, start: startDateTime, end: endDateTime, reason };
}

/**
 * Main function to create time off requests
 * @param {boolean} headless - Run in headless mode
 * @param {boolean} manual - Manual mode (user clicks save)
 * @param {boolean} skipVerify - Skip per-record verification
 * @returns {Promise<void>}
 */
async function createTimeOff(headless = true, manual = false, skipVerify = false) {
  const actionData = loadJSON(ACTION_FILE);

  if (!actionData) {
    log.missingFile(ACTION_FILE);
    return;
  }

  const records = actionData.records || [];

  if (records.length === 0) {
    log.nothingToCreate();
    return;
  }

  log.modeInfo(records.length, manual);
  debugLog("createTimeOff_run_start", { recordCount: records.length, manual, skipVerify });

  const created = [];
  const failed = [];
  const skipped = [];

  await withBrowser(CONFIG, headless, async (page) => {
    for (const record of records) {
      try {
        const result = await createOne(page, record, manual, skipVerify);
        if (result) {
          created.push(result);
          if (!skipVerify) {
            updateActionFile([result.date]);
            log.removed(result.date);
          } else {
            log.savedWithoutVerify();
          }
        } else {
          log.skipped(record.date);
          skipped.push(record);
        }
      } catch (err) {
        log.failed(err.message);
        failed.push({ record, error: err.message });
      }
      await sleep(1000);
    }
  });

  log.summary(created.length, failed.length, skipped.length);
  debugLog("createTimeOff_run_end", {
    created: created.length,
    failed: failed.length,
    skipped: skipped.length,
  });
}

// CLI entry point
if (require.main === module) {
  const manual = process.argv.includes("--manual");
  const show = process.argv.includes("--show");
  const skipVerify = process.argv.includes("--skip-verify") || process.argv.includes("--fast");
  const headless = !show && !manual;
  
  createTimeOff(headless, manual, skipVerify).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = { createTimeOff, verifyTimeOffExists };
