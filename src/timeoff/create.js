/**
 * Create late-arrival time off for the records in action-needed.json (API engine).
 */

const CONFIG = require("../shared/config");
const { loadJSON, createTimeOffLogger: log } = require("../shared");
const { SKIPPED } = require("../shared/exit-codes");
const { createTimeOffViaApi } = require("../odoo/create-leave");

const ACTION_FILE = CONFIG.dataFiles.actionNeeded;

/**
 * Create time off requests
 * @param {Array<Object>|null} selectedRecords - Explicit approved records, or null to use action-needed.json
 * @param {Object} options - {dryRun}
 * @returns {Promise<Object>} Structured creation summary
 */
async function createTimeOff(selectedRecords = null, { dryRun = false } = {}) {
  if (selectedRecords === null) {
    const actionData = loadJSON(ACTION_FILE);
    if (!actionData) {
      log.missingFile(ACTION_FILE);
      return { created: [], unverified: [], failed: [], skipped: [], dryRun: [] };
    }
    selectedRecords = actionData.records || [];
  }
  return createTimeOffViaApi(selectedRecords, { dryRun });
}

/**
 * Human summary of a dry run
 * @param {{dryRun: Array<{date: string, parts: Array<{leaveType: string, minutes: number}>}>}} summary
 * @returns {string}
 */
function formatDryRun(summary) {
  const lines = summary.dryRun.flatMap((item) =>
    item.parts.map((part) => `🧪 ${item.date}: ${part.leaveType} — ${part.minutes} phút`),
  );
  return lines.length ? lines.join("\n") : "Không có đơn nào để tạo.";
}

/**
 * Exit code for a creation run: 1 on any failure, 10 when a dry run has nothing to create, else 0
 * @param {{failed: Array<unknown>, unverified: Array<unknown>, dryRun: Array<unknown>}} summary
 * @param {{dryRun: boolean}} options
 * @returns {number}
 */
function summaryExitCode(summary, { dryRun }) {
  if (summary.failed.length || summary.unverified.length) return 1;
  return dryRun && !summary.dryRun.length ? SKIPPED : 0;
}

/**
 * Human summary of a real creation run
 * @param {{created: Array<unknown>, skipped: Array<{date: string, reason?: string}>, failed: Array<{date: string, error: string}>, unverified: Array<{date: string, id?: number}>}} summary
 * @returns {string}
 */
function formatCreateResult(summary) {
  return [
    `✅ Đã tạo ${summary.created.length} đơn`,
    ...summary.skipped.map((s) => `⏭ ${s.date}: ${s.reason === "already exists" ? "đã có" : s.reason}`),
    ...summary.failed.map((f) => `❌ ${f.date}: ${f.error}`),
    ...summary.unverified.map((u) => `⚠️ ${u.date}: đã lưu nhưng khác yêu cầu (#${u.id}) — kiểm tra trên Bemo`),
  ].join("\n");
}

module.exports = { createTimeOff, formatDryRun, summaryExitCode, formatCreateResult };
