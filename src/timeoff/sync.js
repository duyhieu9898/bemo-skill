/**
 * Sync attendance + time off and compute the late days that need time off, over one Bemo connection
 * (one browser launch to read the session cookie instead of one per step).
 */

const { connect } = require("../odoo/client");
const { getAttendance } = require("./attendance");
const { getTimeOff } = require("./timeoff");
const { compare } = require("./compare");

async function sync({ previous = false } = {}) {
  const conn = await connect();
  await getAttendance({ previous, conn });
  await getTimeOff(previous ? "previous" : "current", { conn });
  return compare();
}

module.exports = { sync };
