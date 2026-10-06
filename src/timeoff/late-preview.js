/**
 * Ties `timeoff-late --apply` to the dry run the user just saw: apply only when action-needed.json is the
 * same file the preview read (same sync timestamp) and the preview is recent. One preview, one apply.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../shared/config");
const { loadJSON, saveJSON } = require("../shared");

const PREVIEW_FILE = path.join(path.dirname(CONFIG.dataFiles.actionNeeded), "timeoff-late-preview.json");
const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * @param {{timestamp?: string}|null} actionData - action-needed.json as previewed
 * @param {{file?: string, now?: number}} [options]
 */
function savePreview(actionData, { file = PREVIEW_FILE, now = Date.now() } = {}) {
  if (!saveJSON(file, { sourceTimestamp: actionData?.timestamp ?? null, createdAt: now })) {
    throw new Error(`Không lưu được bản chạy thử: ${file}`);
  }
}

/**
 * Consume the preview or throw why apply is not allowed
 * @param {{timestamp?: string}|null} actionData - action-needed.json now
 * @param {{file?: string, now?: number}} [options]
 */
function takePreview(actionData, { file = PREVIEW_FILE, now = Date.now() } = {}) {
  const preview = loadJSON(file);
  if (!preview) throw new Error("Chưa chạy thử: chạy /bemo_timeoff_late (npm run timeoff-late) trước.");
  fs.rmSync(file, { force: true });
  if (now - preview.createdAt > MAX_AGE_MS) throw new Error("Bản chạy thử đã cũ (quá 5 phút): chạy thử lại.");
  if (preview.sourceTimestamp !== (actionData?.timestamp ?? null)) {
    throw new Error("Danh sách ngày đi trễ đã thay đổi sau khi chạy thử: chạy thử lại.");
  }
}

module.exports = { savePreview, takePreview };
