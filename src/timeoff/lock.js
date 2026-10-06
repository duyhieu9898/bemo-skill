/**
 * Single-writer lock for creating time off: two runs at once (CLI + Telegram) could both pass the
 * duplicate check and create the same request twice.
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../shared/config");
const { bemoError } = require("../shared/errors");

const DEFAULT_LOCK_FILE = path.join(path.dirname(CONFIG.dataFiles.actionNeeded), ".create-timeoff.lock");

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function tryAcquire(lockFile) {
  try {
    fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx" });
    return { acquired: true };
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    let holder = null;
    try {
      holder = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    } catch {
      // Unreadable lock: treat as held, a human should look at it.
    }
    return { acquired: false, holder };
  }
}

/**
 * Run fn while holding the lock; refuse if another live process holds it
 * @param {function} fn - Async work
 * @param {Object} options - {lockFile}
 * @returns {Promise<*>} fn result
 */
async function withCreateLock(fn, { lockFile = DEFAULT_LOCK_FILE } = {}) {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let attempt = tryAcquire(lockFile);
  if (!attempt.acquired && attempt.holder?.pid && !isProcessAlive(attempt.holder.pid)) {
    // Left behind by a crashed run.
    fs.rmSync(lockFile, { force: true });
    attempt = tryAcquire(lockFile);
  }
  if (!attempt.acquired) {
    const who = attempt.holder ? `pid ${attempt.holder.pid} since ${attempt.holder.startedAt}` : "unknown holder";
    throw bemoError(`Another time off creation is running (${who}). Lock: ${lockFile}`, "BEMO_LOCKED");
  }

  try {
    return await fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

module.exports = { withCreateLock };
