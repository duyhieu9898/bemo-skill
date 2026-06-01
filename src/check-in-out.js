#!/usr/bin/env node
/**
 * Check In/Out - Automated Bemo Attendance
 */

const CONFIG = require("./config");
const { withBrowser, navigateWithAuth, sleep } = require("./utils");
const { login } = require("./login");

/**
 * Perform Check In/Out action
 * @param {boolean} headless - Run in headless mode
 * @param {object} options - Runtime options
 * @param {boolean} options.checkoutOnly - Only click when the current action is Check out
 */
async function checkInOut(headless = true, options = {}) {
  const { checkoutOnly = false } = options;
  console.log(`🚀 Starting Check In/Out process...`);

  await withBrowser(CONFIG, headless, async (page, browser) => {
    // 1. Navigate to Check In/Out page
    console.log(`📍 Navigating to: ${CONFIG.urls.checkInOut}`);

    // Attempt navigation, if it fails due to auth, login
    try {
      await navigateWithAuth(page, CONFIG.urls.checkInOut);
    } catch (e) {
      console.log("⚠️ Not logged in, attempting auto-login...");
      await login();
      await navigateWithAuth(page, CONFIG.urls.checkInOut);
    }

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

    // 4. Click the button
    await page.click(buttonSelector);
    console.log(`👆 Clicked ${status.label} button!`);

    // 5. Wait a bit for the action to register
    await sleep(2000);

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
    console.log(`Usage: node src/check-in-out.js [--checkout-only] [--show]

Options:
  --checkout-only  Only click when the current action is Check out
  --show           Run with a visible browser
  --help           Show this help message`);
    process.exit(0);
  }

  const show = process.argv.includes("--show");
  const checkoutOnly = process.argv.includes("--checkout-only");
  const headless = !show;

  checkInOut(headless, { checkoutOnly }).catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
}

module.exports = { checkInOut, isCheckoutAction };
