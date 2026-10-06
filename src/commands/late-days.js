#!/usr/bin/env node
/** Late days waiting for time off, from the last sync. Usage: node src/commands/late-days.js */
const CONFIG = require("../shared/config");
const { loadJSON } = require("../shared");
const { say, fail } = require("../shared/report");
const { listLateRecords, formatLateDays } = require("../timeoff/late-days");

try {
  const actionData = loadJSON(CONFIG.dataFiles.actionNeeded);
  if (!actionData) throw new Error("Chưa có dữ liệu, chạy sync trước (/bemo_sync).");
  const list = listLateRecords(actionData);
  say(formatLateDays(list));
  if (list.syncedAt) say(`Sync lần cuối: ${new Date(list.syncedAt).toLocaleString("vi-VN")}`);
} catch (err) {
  fail(err);
}
