/**
 * Date utilities - Date parsing and filtering helpers
 */

/**
 * Parse date from DD/MM/YYYY format
 * @param {string} dateStr - Date string in DD/MM/YYYY format
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  const match = dateStr?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? new Date(`${match[3]}-${match[2]}-${match[1]}`) : null;
}

/**
 * Parse time string to minutes
 * @param {string} timeStr - Time string in HH:MM format
 * @returns {number} Total minutes
 */
function parseTimeToMinutes(timeStr) {
  const match = timeStr?.match(/(\d+):(\d+)/);
  return match ? parseInt(match[1]) * 60 + parseInt(match[2]) : 0;
}

/**
 * Get filter months for current and previous month
 * @returns {Array<{month: number, year: number}>}
 */
function getFilterMonths() {
  const now = new Date();
  const currMonth = now.getMonth();
  const currYear = now.getFullYear();
  
  const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
  const prevYear = currMonth === 0 ? currYear - 1 : currYear;
  
  return [
    { month: currMonth, year: currYear },
    { month: prevMonth, year: prevYear },
  ];
}

/**
 * Check if a date falls within filter months
 * @param {Date} date - Date to check
 * @param {Array<{month: number, year: number}>} filters - Filter months
 * @returns {boolean}
 */
function isInFilterMonths(date, filters) {
  if (!date) return false;
  return filters.some(
    (f) => f.month === date.getMonth() && f.year === date.getFullYear()
  );
}

/**
 * Format date for display
 * @param {Date} date - Date object
 * @returns {string} Formatted date DD/MM/YYYY
 */
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get date string from datetime string
 * @param {string} dateTimeStr - DateTime string with space separator
 * @returns {string} Date part only
 */
function extractDateFromDateTime(dateTimeStr) {
  return dateTimeStr?.split(" ")[0] || "";
}

/**
 * Get time string from datetime string
 * @param {string} dateTimeStr - DateTime string with space separator
 * @returns {string} Time part only
 */
function extractTimeFromDateTime(dateTimeStr) {
  return dateTimeStr?.split(" ")[1] || "";
}

module.exports = {
  parseDate,
  parseTimeToMinutes,
  getFilterMonths,
  isInFilterMonths,
  formatDate,
  extractDateFromDateTime,
  extractTimeFromDateTime,
};
