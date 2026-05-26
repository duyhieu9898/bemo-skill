/**
 * Logic & Balancing helpers for Time Off creation
 */

const { saveJSON, createDataWrapper, createTimeOffLogger: log, debugLog } = require("../utils");

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
 * Filter and sort only Annual Leave types, prioritizes older years first
 * @param {Array} allLeaveTypes - All available types
 * @param {number} requiredHours - Required hours
 * @returns {Object} Selected leave type
 */
function findSuitableLeaveType(allLeaveTypes, requiredHours) {
  // Filter only Annual Leave types
  const annualLeaveTypes = allLeaveTypes.filter((t) => t.name.toLowerCase().includes("annual leave"));

  if (annualLeaveTypes.length === 0) {
    throw new Error("No Annual Leave types found in dropdown");
  }

  // Sort by year ascending (older years first)
  const sortedByYear = annualLeaveTypes.sort((a, b) => {
    const yearA = extractYearFromLeaveType(a.name);
    const yearB = extractYearFromLeaveType(b.name);
    return yearA - yearB;
  });

  // Find first suitable type with enough balance
  const suitableType = sortedByYear.find((t) => t.remaining >= requiredHours);

  if (!suitableType) {
    const maxAvailable = annualLeaveTypes.length > 0 ? Math.max(...annualLeaveTypes.map((t) => t.remaining)) : 0;
    throw new Error(`Insufficient Annual Leave balance. Required: ${requiredHours}h, Max available: ${maxAvailable}h`);
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
  
  const updatedCache = [...cache];
  const usedHours = usedMinutes / 60;
  const typeIndex = updatedCache.findIndex(t => t.name === typeName);
  
  if (typeIndex !== -1) {
    updatedCache[typeIndex].remaining -= usedHours;
    // Ensure it doesn't go below 0 due to rounding
    if (updatedCache[typeIndex].remaining < 0) updatedCache[typeIndex].remaining = 0;
    
    debugLog("create-timeoff.json", "updated_session_cache", { 
      type: typeName, 
      newBalance: updatedCache[typeIndex].remaining 
    });
  }
  
  return updatedCache;
}

module.exports = {
  extractYearFromLeaveType,
  findSuitableLeaveType,
  updateSessionLeaveCache
};
