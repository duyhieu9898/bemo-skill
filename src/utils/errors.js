/**
 * Errors carrying a machine-readable code (e.g. BEMO_NOT_LOGGED_IN, BEMO_SAFETY, BEMO_LOCKED)
 */

/**
 * @param {string} message - Human-readable message
 * @param {string} code - Machine-readable code
 * @param {Object} [extra] - Extra properties
 * @returns {Error & {code: string}}
 */
function bemoError(message, code, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

module.exports = { bemoError };
