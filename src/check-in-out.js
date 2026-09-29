#!/usr/bin/env node
/**
 * Check In/Out - Automated Bemo Attendance
 */

const CONFIG = require("./config");
const { withBrowser, navigateWithAuth } = require("./utils");
const { login } = require("./login");
const { isOvertime } = require("./overtime");

const ATTENDANCE_RPC = "/web/dataset/call_kw/hr.employee/attendance_manual";
// Bemo reads geolocation before sending the RPC, so allow more than a plain request.
const ATTENDANCE_RPC_TIMEOUT = 30000;

/**
 * Perform Check In/Out action, logging in once and retrying if the session expired
 * @param {boolean} headless - Run in headless mode
 * @param {object} options - Runtime options
 * @param {boolean} [options.checkoutOnly] - Only click when the current action is Check out
 * @param {boolean} [options.respectOvertime] - Skip when today is marked as overtime (automatic runs)
 */
async function checkInOut(headless = true, options = {}) {
  console.log(`🚀 Starting Check In/Out process...`);

  if (options.respectOvertime && isOvertime()) {
    console.log("🕔 Today is marked as overtime: automatic checkout skipped. Run `npm run checkout` when you leave.");
    return;
  }

  try {
    await runCheckInOut(headless, options);
  } catch (err) {
    if (err.code !== "BEMO_NOT_LOGGED_IN") throw err;
    // login() opens its own browser on the same profile, so it must run after this one is closed.
    console.log("⚠️ Not logged in, attempting auto-login...");
    await login();
    await runCheckInOut(headless, options);
  }
}

async function runCheckInOut(headless, { checkoutOnly = false }) {
  await withBrowser(CONFIG, headless, async (page) => {
    // 1. Navigate to Check In/Out page
    console.log(`📍 Navigating to: ${CONFIG.urls.checkInOut}`);
    await navigateWithAuth(page, CONFIG.urls.checkInOut);

    // 2. Wait for the button to appear
    const buttonSelector = ".o_hr_attendance_sign_in_out_icon";
    try {
      await page.waitForSelector(buttonSelector, { timeout: 15000 });
    } catch (err) {
      throw new Error("Check In/Out button not found. Are you already on the right page?");
    }

    // 3. Get current status (Check in or Check out)
    const status = await page.evaluate((sel) => {
      const btn = document.querySelector(sel);
      return {
        label: btn?.getAttribute("aria-label") || "Unknown",
        title: btn?.getAttribute("title") || "Unknown",
      };
    }, buttonSelector);

    console.log(`🔍 Current action detected: ${status.label}`);

    if (checkoutOnly && !isCheckoutAction(status)) {
      console.log("ℹ️ Checkout-only mode: current action is not Check out, skipping click.");
      return;
    }

    // 4. Click the button and wait for Odoo's answer instead of assuming success
    const response = page.waitForResponse((res) => res.url().includes(ATTENDANCE_RPC), {
      timeout: ATTENDANCE_RPC_TIMEOUT,
    });
    response.catch(() => {});
    await page.click(buttonSelector);
    console.log(`👆 Clicked ${status.label} button!`);

    let body;
    try {
      body = await (await response).json();
    } catch (err) {
      throw new Error(`${status.label} not confirmed: no attendance response from Bemo (${err.message})`);
    }

    // 5. Odoo returns { result: { action } } on success, { result: { warning } } or { error } otherwise
    const failure = body.error?.data?.message || body.error?.message || body.result?.warning;
    if (failure || !body.result?.action) {
      throw new Error(`${status.label} rejected by Bemo: ${failure || "unexpected response"}`);
    }

    console.log(`✅ ${status.label} completed successfully!`);
  });
}

function isCheckoutAction(status) {
  const text = `${status.label || ""} ${status.title || ""}`.toLowerCase();
  return text.includes("check out") || text.includes("checkout");
}

// CLI entry point
if (require.main === module) {
  if (process.argv.includes("--help")) {
    console.log(`Usage: node src/check-in-out.js [--checkout-only] [--respect-overtime] [--show]

Options:
  --checkout-only     Only click when the current action is Check out
  --respect-overtime  Skip when today is marked with: npm run overtime -- on
  --show              Run with a visible browser
  --help           Show this help message`);
    process.exit(0);
  }

  const show = process.argv.includes("--show");
  const checkoutOnly = process.argv.includes("--checkout-only");
  const respectOvertime = process.argv.includes("--respect-overtime");
  const headless = !show;

  checkInOut(headless, { checkoutOnly, respectOvertime }).catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
}

module.exports = { checkInOut, isCheckoutAction };
