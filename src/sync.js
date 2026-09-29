#!/usr/bin/env node
/**
 * Sync attendance + time off and compute the late days that need time off, over one Bemo connection
 * (one browser launch to read the session cookie instead of one per step).
 * Usage: node src/sync.js [--previous]
 */

const { connect } = require("./rpc/client");
const { getAttendance } = require("./get-attendance");
const { getTimeOff } = require("./get-timeoff");
const { compare } = require("./compare");

async function sync({ previous = false } = {}) {
  const conn = await connect();
  await getAttendance({ previous, conn });
  await getTimeOff(previous ? "previous" : "current", { conn });
  return compare();
}

if (require.main === module) {
  sync({ previous: process.argv.includes("--previous") }).catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
  });
}

module.exports = { sync };
