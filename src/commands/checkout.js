#!/usr/bin/env node
/**
 * Checkout on Bemo.
 * Usage: node src/commands/checkout.js [--scheduled] [--show]
 *   --scheduled  Cron run: skipped (exit 10) while the auto switch is off
 *   --show       Visible browser
 */

const { checkInOut } = require("../browser/checkout");
const { readAuto, describeAuto } = require("../timeoff/auto");
const { SKIPPED } = require("../shared/exit-codes");

/**
 * Why a run must be skipped, or null to run
 * @param {boolean} scheduled - Started by cron
 * @param {() => {enabled: boolean, changedAt: string|null}} [read]
 * @returns {string|null}
 */
function scheduledSkipReason(scheduled, read = readAuto) {
  if (!scheduled) return null;
  const auto = read();
  return auto.enabled ? null : describeAuto(auto);
}

/**
 * Exit code and message for a checkout run: a run without a click is a skip, not a success
 * @param {{clicked: boolean, action: string}} result
 * @returns {{exitCode: number, message: string|null}}
 */
function checkoutOutcome({ clicked, action }) {
  if (clicked) return { exitCode: 0, message: null };
  return {
    exitCode: SKIPPED,
    message: `⏸️ Không checkout: Bemo đang hiện nút "${action}" (chưa check-in hôm nay, hoặc đã checkout rồi).`,
  };
}

async function main(argv) {
  const skip = scheduledSkipReason(argv.includes("--scheduled"));
  if (skip) {
    console.log(skip);
    process.exitCode = SKIPPED;
    return;
  }
  const { exitCode, message } = checkoutOutcome(await checkInOut(!argv.includes("--show"), { checkoutOnly: true }));
  if (message) console.log(message);
  process.exitCode = exitCode;
}

module.exports = { scheduledSkipReason, checkoutOutcome };

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
}
