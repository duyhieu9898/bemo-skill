/**
 * Verify Time Off - remove records from action-needed.json that already have an active time off
 * covering workSchedule.start -> check-in time (JSON-RPC).
 */

const CONFIG = require("../shared/config");
const BUSINESS = require("./business-rules");
const { loadRecords, extractTimeFromDateTime } = require("../shared");
const { connect } = require("../odoo/client");
const { localDisplayToOdoo } = require("../odoo/datetime");
const { findActiveLeavesOnDay } = require("../odoo/create-leave");
const { removeFromActionFile } = require("./action-file");

const ACTION_FILE = CONFIG.dataFiles.actionNeeded;

async function verifyAll() {
  const records = loadRecords(ACTION_FILE);
  if (records.length === 0) {
    console.log("No records in action-needed.json to verify.");
    return;
  }

  console.log(`🔍 Verifying ${records.length} records against Bemo...`);
  const conn = await connect();
  const [employee] = await conn.rpc.callKw("hr.employee", "search_read", [], {
    domain: [["user_id", "=", conn.uid]],
    fields: ["id"],
    limit: 1,
    context: conn.context,
  });
  if (!employee) throw new Error("No employee linked to the logged-in user");

  const verifiedDates = [];
  for (const record of records) {
    const dateFrom = localDisplayToOdoo(`${record.date} ${BUSINESS.workSchedule.start}`, conn.tz);
    const dateTo = localDisplayToOdoo(`${record.date} ${extractTimeFromDateTime(record.checkInDateTime)}`, conn.tz);
    const leaves = await findActiveLeavesOnDay(conn, employee.id, record.date);
    // Covered only if one active request spans the whole late period.
    if (leaves.some((l) => l.date_from <= dateFrom && l.date_to >= dateTo)) verifiedDates.push(record.date);
  }

  if (verifiedDates.length > 0) {
    removeFromActionFile(verifiedDates);
    console.log(`✅ ${verifiedDates.length} records already have time off; removed from action-needed.json`);
  }
  const missing = records.length - verifiedDates.length;
  if (missing > 0) console.log(`❌ ${missing} records still missing in Bemo.`);
}

module.exports = { verifyAll };
