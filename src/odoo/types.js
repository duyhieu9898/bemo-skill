/**
 * Shapes of the Odoo records read through JSON-RPC (only the fields this project requests).
 * JSDoc only: `npm run typecheck` uses them to catch misspelled or missing fields.
 * Many2one fields come back as [id, display name] or false.
 */

/** @typedef {[number, string] | false} Many2one */

/**
 * @typedef {Object} OdooAttendance
 * @property {number} id
 * @property {string} check_in - UTC "YYYY-MM-DD HH:MM:SS"
 * @property {number} hours_arrive_late - Float hours
 */

/**
 * @typedef {Object} OdooLeave
 * @property {number} id
 * @property {Many2one} holiday_status_id
 * @property {string} date_from - UTC "YYYY-MM-DD HH:MM:SS"
 * @property {string} date_to - UTC "YYYY-MM-DD HH:MM:SS"
 * @property {string} state - draft | confirm | refuse | validate1 | validate | cancel
 * @property {number} [number_of_minutes_display]
 */

/**
 * @typedef {Object} OdooLeaveType
 * @property {number} id
 * @property {string} name
 * @property {string} request_unit - hour | half_day | day
 * @property {number} virtual_remaining_leaves - Hours, pending requests already deducted
 */

module.exports = {};
