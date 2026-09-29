/**
 * Logic & Balancing helpers for Time Off creation
 */

const BUSINESS = require("../business-rules");
const { debugLog } = require("../utils");

/**
 * Extract year from leave type name
 * @param {string} name - Leave type name (e.g., "Annual Leave 2025 - Hours")
 * @returns {number} Year or Infinity if not found
 */
function extractYearFromLeaveType(name) {
  const match = name.match(/(\d{4})/);
  return match ? parseInt(match[1]) : Infinity;
}

/**
 * Pick the leave type to use, following BUSINESS.leaveTypePriority:
 * the first priority entry with a matching type that has enough balance wins;
 * within one entry, older years are used first.
 * @param {Array} allLeaveTypes - Available types ({name, remaining})
 * @param {number} requiredHours - Required hours
 * @param {Array<string>} priority - Name fragments in priority order
 * @returns {Object} Selected leave type
 */
function findSuitableLeaveType(allLeaveTypes, requiredHours, priority = BUSINESS.leaveTypePriority) {
  const byPriority = priority.map((fragment) =>
    allLeaveTypes
      .filter((t) => t.name.toLowerCase().includes(fragment.toLowerCase()))
      .sort((a, b) => extractYearFromLeaveType(a.name) - extractYearFromLeaveType(b.name)),
  );
  const candidates = byPriority.flat();

  if (candidates.length === 0) {
    throw new Error(`No leave types matching priority list: ${priority.join(", ")}`);
  }

  const suitableType = candidates.find((t) => t.remaining >= requiredHours);

  if (!suitableType) {
    const maxAvailable = Math.max(...candidates.map((t) => t.remaining));
    throw new Error(
      `Insufficient balance in ${priority.join(", ")}. Required: ${requiredHours}h, Max available: ${maxAvailable}h`,
    );
  }

  return suitableType;
}

module.exports = {
  extractYearFromLeaveType,
  findSuitableLeaveType,
};
