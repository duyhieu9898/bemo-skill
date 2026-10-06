/**
 * Logger utilities - Centralized logging helpers
 */
const fs = require("fs");
const path = require("path");
const { bemoError } = require("./errors");

const ICONS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
  skip: "⏭️",
  lock: "🔒",
  pin: "📌",
  wait: "⏳",
  save: "💾",
  celebrate: "🎉",
  chart: "📊",
  create: "📝",
  check: "✅",
  duration: "⏱️",
  pause: "⏸️",
};

// BEMO_LOG_DIR overrides the location; under `node --test` logs go to a temp dir so tests never touch logs/.
const LOG_DIR =
  process.env.BEMO_LOG_DIR ||
  (process.env.NODE_TEST_CONTEXT
    ? path.join(require("os").tmpdir(), "bemo-test-logs")
    : path.join(__dirname, "..", "..", "logs"));
const MAIN_LOG_FILE = path.join(LOG_DIR, "bemo.log");

/**
 * Append message to the main log file
 * @param {string} msg - Message to log
 */
function writeToLogFile(msg) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    // Remove emojis for the text log file for better compatibility
    const cleanMsg = msg.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]/gu, "").trim();
    fs.appendFileSync(MAIN_LOG_FILE, `[${timestamp}] ${cleanMsg}\n`);
  } catch (err) {
    // Silent fail for logging errors
  }
}

/**
 * Base logger with formatting and file persistence
 */
const baseLog = {
  success: (msg) => {
    const formatted = `${ICONS.success} ${msg}`;
    console.log(formatted);
    writeToLogFile(formatted);
  },
  error: (msg) => {
    const formatted = `${ICONS.error} ${msg}`;
    console.error(formatted);
    writeToLogFile(formatted);
  },
  warning: (msg) => {
    const formatted = `${ICONS.warning} ${msg}`;
    console.warn(formatted);
    writeToLogFile(formatted);
  },
  info: (msg) => {
    const formatted = `${ICONS.info} ${msg}`;
    console.log(formatted);
    writeToLogFile(formatted);
  },
  skip: (msg) => {
    const formatted = `${ICONS.skip} ${msg}`;
    console.log(formatted);
    writeToLogFile(formatted);
  },
  indent: (msg, level = 1) => {
    const space = "   ".repeat(level);
    console.log(`${space}${msg}`);
    writeToLogFile(`${space}${msg}`);
  },
  raw: (msg) => {
    console.log(msg);
    writeToLogFile(msg);
  },
};

/**
 * Login module logger
 */
const loginLogger = {
  header: () => {
    baseLog.raw(`${ICONS.lock} Opening Bemo Login`);
    baseLog.raw("======================\n");
  },
  alreadyLoggedIn: () => baseLog.success("Already logged in!"),
  pleaseLogin: () => {
    baseLog.raw(`${ICONS.pin} Please login in the browser window`);
    baseLog.raw(`${ICONS.wait} Waiting for login (max 2 minutes)...\n`);
  },
  success: (userDataDir) => {
    baseLog.success("Logged in successfully!");
    baseLog.raw(`${ICONS.save} Session saved to: ${userDataDir}`);
    baseLog.raw(`\n${ICONS.celebrate} You can now run other scripts with --headless`);
  },
  error: (err) => baseLog.error(err.message),
};

/**
 * Compare module logger
 */
const compareLogger = {
  header: () => {
    baseLog.raw(`\n${ICONS.chart} Comparison Result`);
    baseLog.raw("=====================");
  },
  summary: (existing, needsAction, skipped) => {
    baseLog.success(`Existing: ${existing}`);
    baseLog.raw(`${ICONS.warning}  Needs Time Off: ${needsAction}`);
    baseLog.raw(`${ICONS.info}  Skipped: ${skipped}`);
  },
  needsCreate: (records) => {
    baseLog.raw(`\n${ICONS.create} Need to create:`);
    records.forEach((r) => {
      baseLog.indent(`${r.date}: ${r.late} (${r.lateMinutes} mins)`);
    });
  },
  saved: (filename) => baseLog.raw(`\n${ICONS.save} Saved to ${filename}`),
  timestampCheck: (attFormatted, toFormatted, match) => {
    baseLog.raw(`📅 Attendance data: ${attFormatted}`);
    baseLog.raw(`📅 Time Off data:   ${toFormatted}`);
    if (match) {
      baseLog.raw(`${ICONS.success} Data timestamps match (same hour)\n`);
    } else {
      baseLog.raw(`\n${ICONS.warning} WARNING: Data files were NOT fetched at the same time!`);
      baseLog.raw("   Please run both commands again:");
      baseLog.raw("   node get-attendance.js && node get-timeoff.js\n");
    }
  },
  timestampWarning: () => baseLog.raw(`${ICONS.warning}  Warning: Data files missing timestamp`),
};

/**
 * Create Time Off module logger
 */
const createTimeOffLogger = {
  createStart: (date, endTime, minutes, requiredHours, startTime) => {
    baseLog.raw(`\n${ICONS.create} Creating: ${date}`);
    baseLog.indent(`Time: ${startTime} → ${endTime} (${minutes} mins = ${requiredHours.toFixed(2)}h)`);
  },

  leaveTypes: (types) => {
    baseLog.indent(`${ICONS.check} Available leave types:`);
    types.forEach((t) => {
      baseLog.indent(`- ${t.name}: ${t.remaining} hours remaining`, 2);
    });
  },

  splitPlan: (parts) => {
    baseLog.indent(`${ICONS.success} No single leave type has enough balance, splitting the day:`);
    parts.forEach((p) => baseLog.indent(`- ${p.start} → ${p.end}: ${p.name} (${p.minutes} mins)`, 2));
  },

  selectedType: (type) => {
    baseLog.indent(`${ICONS.success} Selected: ${type.name} (${type.remaining}h available)`);
  },

  durationValid: (minutes) => {
    baseLog.indent(`${ICONS.success} Duration valid: ${minutes} minutes`);
  },

  durationWarning: (msg) => baseLog.indent(`${ICONS.warning} ${msg}`),

  skipping: (reason) => {
    baseLog.raw(`   ${ICONS.warning}  ${reason}`);
    baseLog.indent(`${ICONS.skip} Skipping this record...`);
  },

  failed: (msg) => baseLog.raw(`   ${ICONS.error} Failed: ${msg}`),

  summary: (created, failed, skipped = 0, unverified = 0) => {
    baseLog.raw(`\n${ICONS.success} Created: ${created}`);
    if (unverified > 0) {
      baseLog.raw(`${ICONS.error} Saved but WRONG: ${unverified} (see messages above, check them in Bemo)`);
    }
    if (skipped > 0) baseLog.raw(`${ICONS.skip} Skipped: ${skipped}`);
    if (failed > 0) baseLog.raw(`${ICONS.error} Failed: ${failed}`);
  },

  modeInfo: (count) => baseLog.raw(`${ICONS.create} Creating ${count} Time Off request(s)`),

  nothingToCreate: () => baseLog.info("Nothing to create. Run: npm run data:sync"),
  
  missingFile: (file) => {
    baseLog.error(`Missing data file: ${file}`);
    baseLog.raw("👉 Please run: npm run data:sync");
  },

  verified: (id) => baseLog.indent(`${ICONS.success} Verified: time off #${id} saved as requested`),

  unverified: (date, id, mismatches) => {
    baseLog.error(`Time off #${id} for ${date} was SAVED but differs from the request: ${mismatches.join("; ")}`);
    baseLog.raw(`   👉 Check #${id} in Bemo and fix or cancel it by hand. Do NOT recreate ${date}.`);
  },
  
  alreadyExists: (date) => baseLog.indent(`${ICONS.skip} ${date} already has an active time off in that range, not creating another`),

  removed: (date) => baseLog.indent(`${ICONS.success} Removed ${date} from action-needed.json`),
};

/**
 * Data fetch modules logger (attendance, timeoff)
 */
const dataLogger = {
  saved: (count, filename) => baseLog.success(`Saved ${count} records to ${filename}`),
  notLoggedIn: () => {
    throw bemoError("Not logged in to Bemo. Run: npm run auth", "BEMO_NOT_LOGGED_IN");
  },
};

/**
 * Enhanced debug logging for troubleshooting
 * @param {string} filename - Filename to save to (e.g., 'create-timeoff.json')
 * @param {string} action - Action name
 * @param {Object} data - Log data
 */
function debugLog(filename, action, data = {}) {
  try {
    const logFile = path.join(LOG_DIR, filename);
    const logDir = path.dirname(logFile);
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      ...data,
    };

    let logs = [];
    if (fs.existsSync(logFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logFile, "utf8"));
      } catch (e) {
        logs = [];
      }
    }

    logs.push(logEntry);
    
    // Keep only last 1000 entries to prevent file bloat
    if (logs.length > 1000) {
      logs = logs.slice(-1000);
    }

    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error(`Failed to write debug log to ${filename}:`, err.message);
  }
}

module.exports = {
  ICONS,
  baseLog,
  loginLogger,
  compareLogger,
  createTimeOffLogger,
  dataLogger,
  debugLog,
};
