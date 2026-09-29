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

/**
 * Update the session cache after a successful creation
 * @param {Array} cache - The in-memory cache array
 * @param {string} typeName - Name of the leave type used
 * @param {number} usedMinutes - Minutes used
 * @returns {Array} Updated cache
 */
function updateSessionLeaveCache(cache, typeName, usedMinutes) {
  if (!cache) return null;
  
  const usedHours = usedMinutes / 60;
  // Copy the updated entry too, so callers holding the old array are not mutated.
  const updatedCache = cache.map((t) =>
    t.name === typeName ? { ...t, remaining: Math.max(0, t.remaining - usedHours) } : t,
  );
  const updated = updatedCache.find((t) => t.name === typeName);

  if (updated) {
    debugLog("create-timeoff.json", "updated_session_cache", {
      type: typeName,
      newBalance: updated.remaining,
    });
  }

  return updatedCache;
}

module.exports = {
  extractYearFromLeaveType,
  findSuitableLeaveType,
  updateSessionLeaveCache
};
