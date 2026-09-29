#!/usr/bin/env node
/**
 * Create Time Off - Automated time off request creation
 * Refactored version using sub-modules
 */

const CONFIG = require("./config");
const BUSINESS = require("./business-rules");
const {
  withBrowser,
  sleep,
  clickButtonByText,
  loadJSON,
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
const { removeFromActionFile } = require("./timeoff/action-file");
const { checkLateRequest, checkRun, assertSafe } = require("./timeoff/safety");
const { createTimeOffViaApi } = require("./rpc/create-leave");

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
  saveDialogClose: 15000,
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
  const selected = await selectLeaveType(page, suitableType.name);
  if (!selected) {
    const err = new Error(`Could not select leave type "${suitableType.name}" in the form`);
    err.selectionFailed = true;
    throw err;
  }
  log.selectedType(suitableType);

  return suitableType;
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
  const { date, canonicalDate, checkInDateTime, lateMinutes, reason: recordReason } = record;
  const checkInTime = extractTimeFromDateTime(checkInDateTime);
  const requiredHours = lateMinutes / 60;

  log.createStart(date, checkInTime, lateMinutes, requiredHours, BUSINESS.workSchedule.start);
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
    // A UI selection failure is a real failure, not a balance skip.
    if (err.selectionFailed) throw err;
    debugLog("createOne_skipping", { date, error: err.message });
    log.skipping(err.message);
    return null;
  }

  // Prepare form data
  const startDateTime = `${date} ${BUSINESS.workSchedule.start}:00`;
  const endDateTime = `${date} ${checkInTime}:00`;
  const reason = recordReason || BUSINESS.lateArrival.defaultReason;

  // Fill form
  const fillResult = await fillTimeOffForm(page, startDateTime, endDateTime, reason);
  log.fillResult(fillResult);

  if (!fillResult.start || !fillResult.end) {
    throw new Error(`Form fill failed: start=${fillResult.start}, end=${fillResult.end}`);
  }

  // Validate duration
  const maxAllowedMinutes = Math.max(BUSINESS.lateArrival.maxMinutes, lateMinutes);
  const durationValidation = await validateDuration(page, lateMinutes, maxAllowedMinutes);

  if (!durationValidation.found) {
    log.durationWarning(`Could not validate duration field: ${durationValidation.message}`);
  } else if (!durationValidation.isValid) {
    const errors = [];
    if (!durationValidation.isUnderMax) {
      errors.push(`Duration ${durationValidation.actualMinutes} mins > ${BUSINESS.lateArrival.maxMinutes} mins limit`);
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

  // Hard safety rules on what the form will save (the browser cannot see other leaves that day).
  assertSafe(checkLateRequest({ date, start: formValues.startValue, end: formValues.endValue, lateMinutes }), date);

  // Save
  let verified = false;
  if (manual) {
    log.manualMode();
    await sleep(TIMING.manualSave);
  } else {
    log.autoSaving();
    await clickButtonByText(page, "save");
    await waitForSaveDialogClosed(page);

    // The dialog closed, so Bemo accepted the record: consume the balance even if verification lags.
    if (usedLeaveType) {
      sessionLeaveTypes = updateSessionLeaveCache(sessionLeaveTypes, usedLeaveType.name, lateMinutes);
    }

    if (!skipVerify) {
      log.verifying();
      verified = await verifyTimeOffExists(page, date, CONFIG.urls.timeoffList, {
        startTime: BUSINESS.workSchedule.start,
      });
      if (verified) log.verified();
      else log.unverified(date);
    }
  }

  return { date, canonicalDate, start: startDateTime, end: endDateTime, reason, verified };
}

/**
 * Wait until the time off form dialog closes after clicking Save.
 * The form opens as a modal from the calendar view, so a closed modal means Odoo accepted the record.
 * @param {Page} page - Puppeteer page
 * @throws {Error} If the dialog is still open (validation error or save hang)
 */
async function waitForSaveDialogClosed(page) {
  try {
    await page.waitForFunction(() => !document.querySelector(".modal .o_form_view"), {
      timeout: TIMING.saveDialogClose,
    });
  } catch (err) {
    const dialogText = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".modal .modal-body"))
        .map((el) => el.innerText.trim())
        .filter(Boolean)
        .pop() || "",
    );
    debugLog("autoSave_dialog_still_open", { dialogText: dialogText.slice(0, 500) });
    throw new Error(`Save did not complete, dialog still open: ${dialogText.slice(0, 200) || "no message"}`);
  }
}

/**
 * Main function to create time off requests
 * @param {boolean} headless - Run in headless mode
 * @param {boolean} manual - Manual mode (user clicks save)
 * @param {boolean} skipVerify - Skip per-record verification
 * @param {Array<Object>|null} selectedRecords - Explicit approved records, or null to use action-needed.json
 * @param {Object} options - Options
 * @param {"api"|"browser"} [options.engine] - "api" (default) or "browser"; manual mode always uses the browser
 * @param {boolean} [options.dryRun=false] - API engine only: fill and validate without creating
 * @returns {Promise<Object>} Structured creation summary
 */
async function createTimeOff(headless = true, manual = false, skipVerify = false, selectedRecords = null, options = {}) {
  const { engine = manual ? "browser" : "api", dryRun = false } = options;
  const actionData = selectedRecords === null ? loadJSON(ACTION_FILE) : null;

  if (selectedRecords === null && !actionData) {
    log.missingFile(ACTION_FILE);
    return { created: [], unverified: [], failed: [], skipped: [] };
  }

  const records = selectedRecords === null ? actionData.records || [] : selectedRecords;

  if (records.length === 0) {
    log.nothingToCreate();
    return { created: [], unverified: [], failed: [], skipped: [] };
  }

  assertSafe(checkRun(records), "run");

  if (engine === "api") {
    if (manual) throw new Error("Manual mode needs the browser engine");
    return createTimeOffViaApi(records, { dryRun });
  }
  if (dryRun) throw new Error("--dry-run is only supported by the API engine");

  log.modeInfo(records.length, manual);
  debugLog("createTimeOff_run_start", { recordCount: records.length, manual, skipVerify });

  const created = [];
  const unverified = [];
  const failed = [];
  const skipped = [];

  await withBrowser(CONFIG, headless, async (page) => {
    for (const record of records) {
      try {
        const result = await createOne(page, record, manual, skipVerify);
        if (result?.verified) {
          created.push(result);
          removeFromActionFile([result.date]);
          log.removed(result.date);
        } else if (result) {
          // Saved but not verified: keep it in action-needed.json; run sync/verify before retrying.
          unverified.push(result);
          if (skipVerify) log.savedWithoutVerify();
        } else {
          log.skipped(record.date);
          skipped.push(record);
        }
      } catch (err) {
        log.failed(err.message);
        failed.push({ record, error: err.message });
      }
    }
  });

  log.summary(created.length, failed.length, skipped.length, unverified.length);
  debugLog("createTimeOff_run_end", {
    created: created.length,
    unverified: unverified.length,
    failed: failed.length,
    skipped: skipped.length,
  });

  return {
    created,
    unverified,
    failed: failed.map(({ record, error }) => ({ date: record.date, error })),
    skipped: skipped.map((record) => ({ date: record.date })),
  };
}

// CLI entry point
if (require.main === module) {
  const manual = process.argv.includes("--manual");
  const show = process.argv.includes("--show");
  const skipVerify = process.argv.includes("--skip-verify") || process.argv.includes("--fast");
  const headless = !show && !manual;
  const engine = manual || process.argv.includes("--browser") ? "browser" : "api";
  const dryRun = process.argv.includes("--dry-run");

  createTimeOff(headless, manual, skipVerify, null, { engine, dryRun }).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = { createTimeOff, verifyTimeOffExists };
