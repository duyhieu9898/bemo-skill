/**
 * Late days waiting for time off (from action-needed.json written by sync)
 */

const { toIsoDate, isoToDisplay, extractTimeFromDateTime } = require("../shared");

/**
 * @param {{timestamp?: string, records?: Array<{date: string, checkInDateTime?: string, lateMinutes: number}>}|null} actionData
 * @returns {{syncedAt: string|null, records: Array<{date: string, checkIn: string, lateMinutes: number}>}}
 */
function listLateRecords(actionData) {
  const records = (actionData?.records || []).map((record) => {
    const date = toIsoDate(record.date);
    if (!date) throw new Error(`Ngày không hợp lệ trong action-needed.json: ${record.date}`);
    return { date, checkIn: extractTimeFromDateTime(record.checkInDateTime), lateMinutes: record.lateMinutes };
  });
  records.sort((a, b) => a.date.localeCompare(b.date));
  return { syncedAt: typeof actionData?.timestamp === "string" ? actionData.timestamp : null, records };
}

/**
 * @param {ReturnType<typeof listLateRecords>} list
 * @returns {string}
 */
function formatLateDays(list) {
  if (!list.records.length) return "Không có ngày đi trễ nào chờ xử lý.";
  const lines = list.records.map((r) => `- ${isoToDisplay(r.date)}: vào ${r.checkIn} (trễ ${r.lateMinutes} phút)`);
  return [`${list.records.length} ngày đi trễ chờ xử lý:`, ...lines].join("\n");
}

module.exports = { listLateRecords, formatLateDays };
