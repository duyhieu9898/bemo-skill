/**
 * Business rules: the ONLY place for company policy and personal preferences.
 * Technical settings (URLs, paths, browser) stay in config.js.
 * Times are local wall-clock "HH:MM". null = not configured yet (rules that need it are skipped).
 */

module.exports = {
  // Working hours
  workSchedule: {
    workDays: [1, 2, 3, 4, 5], // Monday..Friday (0 = Sunday, like Date.getDay)
    start: "08:00", // morning start; late time off always starts here
    lunchStart: "12:00", // morning end; a late request must end before lunch
    lunchEnd: "13:00", // afternoon start
    end: "17:00", // end of the working day
  },

  // Which late arrivals need a time off request
  lateArrival: {
    minMinutes: 7, // below this, no request is needed
    maxMinutes: 60, // above this, handle it manually
    defaultReason: "em xin phép đi trễ vì lý do cá nhân ạ",
  },

  // Full-day leave (workSchedule.start -> workSchedule.end)
  fullDayLeave: {
    defaultReason: "em xin nghỉ phép cả ngày vì lý do cá nhân ạ",
    // No single leave type has 8h: split the day over several types in priority order
    // (e.g. 08:00-15:40 Annual + 15:40-17:00 Compensatory). false = skip the day instead.
    splitAcrossLeaveTypes: true,
  },

  // Leave type choice: first entry with enough balance wins.
  // Each entry matches leave type names containing the text (case-insensitive);
  // several matches (e.g. "Annual Leave 2025 - Hours", "... 2026 ...") are tried oldest year first.
  leaveTypePriority: ["Annual Leave", "Compensatory Leave"],

  // Hard safety limits, checked right before saving. No flag can bypass them.
  // The daily cap on time off is the working time of workSchedule (08-12 + 13-17 = 8h).
  safety: {
    maxRequestsPerRun: 25, // more than a month of working days means the input is wrong
    allowedStates: ["confirm"], // a new request must wait for approval, never be created validated
  },
};
