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
  const candidates = orderByPriority(allLeaveTypes, priority);

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
 * Leave types in priority order: priority entries first, older years first within an entry
 * @param {Array} allLeaveTypes - Available types ({name, remaining})
 * @param {Array<string>} priority - Name fragments in priority order
 * @returns {Array}
 */
function orderByPriority(allLeaveTypes, priority = BUSINESS.leaveTypePriority) {
  return priority.flatMap((fragment) =>
    allLeaveTypes
      .filter((t) => t.name.toLowerCase().includes(fragment.toLowerCase()))
      .sort((a, b) => extractYearFromLeaveType(a.name) - extractYearFromLeaveType(b.name)),
  );
}

/**
 * Split a request over several leave types when no single one has enough balance.
 * Uses one type if possible; otherwise takes each type's whole remaining balance in priority order.
 * @param {Array} allLeaveTypes - Available types ({name, remaining} in hours)
 * @param {number} requiredMinutes - Minutes to cover
 * @param {Array<string>} priority - Name fragments in priority order
 * @returns {Array<{type: Object, minutes: number}>} Parts in order
 */
function planLeaveSplit(allLeaveTypes, requiredMinutes, priority = BUSINESS.leaveTypePriority) {
  const requiredHours = Math.ceil((requiredMinutes / 60) * 100) / 100;
  const single = orderByPriority(allLeaveTypes, priority).find((t) => t.remaining >= requiredHours);
  if (single) return [{ type: single, minutes: requiredMinutes }];

  const parts = [];
  let left = requiredMinutes;
  for (const type of orderByPriority(allLeaveTypes, priority)) {
    if (left === 0) break;
    const available = Math.floor(type.remaining * 60);
    if (available <= 0) continue;
    const minutes = Math.min(available, left);
    parts.push({ type, minutes });
    left -= minutes;
  }
  if (left > 0) {
    const total = parts.reduce((sum, p) => sum + p.minutes, 0);
    throw new Error(
      `Insufficient balance in ${priority.join(", ")} even when split. Required: ${requiredMinutes} mins, available: ${total} mins`,
    );
  }
  return parts;
}

/**
 * Turn consecutive worked-minute parts into wall-clock ranges on the schedule, skipping lunch.
 * A part ending exactly at lunch start makes the next one start at lunch end.
 * @param {Array<number>} partMinutes - Worked minutes of each part, in order
 * @param {Object} schedule - {start, lunchStart, lunchEnd, end} "HH:MM"
 * @returns {Array<{start: string, end: string}>} "HH:MM" ranges
 */
function toWallClockRanges(partMinutes, schedule) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const toTime = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const blocks = schedule.lunchStart && schedule.lunchEnd
    ? [[toMin(schedule.start), toMin(schedule.lunchStart)], [toMin(schedule.lunchEnd), toMin(schedule.end)]]
    : [[toMin(schedule.start), toMin(schedule.end)]];

  // Clock time after `worked` minutes; atStart picks the next block's start on a block boundary.
  const clockAt = (worked, atStart) => {
    let left = worked;
    for (let i = 0; i < blocks.length; i++) {
      const [from, to] = blocks[i];
      const length = to - from;
      if (left < length || (left === length && (!atStart || i === blocks.length - 1))) return from + left;
      left -= length;
    }
    throw new Error(`${worked} worked minutes exceed the working day`);
  };

  const ranges = [];
  let worked = 0;
  for (const minutes of partMinutes) {
    ranges.push({ start: toTime(clockAt(worked, true)), end: toTime(clockAt(worked + minutes, false)) });
    worked += minutes;
  }
  return ranges;
}

module.exports = {
  extractYearFromLeaveType,
  findSuitableLeaveType,
  orderByPriority,
  planLeaveSplit,
  toWallClockRanges,
};
