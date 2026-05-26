/**
 * Logger utilities - Centralized logging helpers
 */
const fs = require("fs");
const path = require("path");

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

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
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
  createStart: (date, checkInTime, lateMinutes, requiredHours, workStartTime = "08:15") => {
    baseLog.raw(`\n${ICONS.create} Creating: ${date}`);
    baseLog.indent(`Time: ${workStartTime} → ${checkInTime} (${lateMinutes} mins = ${requiredHours.toFixed(2)}h)`);
  },

  leaveTypes: (types) => {
    baseLog.indent(`${ICONS.check} Available leave types:`);
    types.forEach((t) => {
      baseLog.indent(`- ${t.name}: ${t.remaining} hours remaining`, 2);
    });
  },

  insufficientBalance: (required, types) => {
    baseLog.indent(`${ICONS.error} Both leave types have insufficient balance!`);
    baseLog.indent(`Required: ${required} hours`, 2);
    types.forEach((t) => {
      const status = t.remaining >= required ? `${ICONS.success} OK` : `${ICONS.error} Not enough`;
      baseLog.indent(`- ${t.name}: ${t.remaining}h ${status}`, 2);
    });
  },

  selectedType: (type) => {
    baseLog.indent(`${ICONS.success} Selected: ${type.name} (${type.remaining}h available)`);
  },

  fillResult: (result) => baseLog.indent(`Fill result: ${JSON.stringify(result)}`),

  durationCheck: (validation) => {
    baseLog.indent(`${ICONS.duration} Duration check: ${JSON.stringify(validation)}`);
  },

  durationValid: (minutes) => {
    baseLog.indent(`${ICONS.success} Duration valid: ${minutes} minutes`);
  },

  durationWarning: (msg) => baseLog.indent(`${ICONS.warning} ${msg}`),

  manualMode: () => {
    baseLog.indent(`${ICONS.pause} MANUAL MODE: Please click Save in browser (60s)...`);
  },

  autoSaving: () => baseLog.indent(`${ICONS.save} Auto-saving...`),

  skipping: (reason) => {
    baseLog.raw(`   ${ICONS.warning}  ${reason}`);
    baseLog.indent(`${ICONS.skip} Skipping this record...`);
  },

  skipped: (date) => {
    baseLog.indent(`${ICONS.skip} Skipped ${date} due to insufficient balance`);
  },

  failed: (msg) => baseLog.raw(`   ${ICONS.error} Failed: ${msg}`),

  summary: (created, failed, skipped = 0) => {
    baseLog.raw(`\n${ICONS.success} Created: ${created}`);
    if (skipped > 0) baseLog.raw(`${ICONS.skip} Skipped: ${skipped}`);
    if (failed > 0) baseLog.raw(`${ICONS.error} Failed: ${failed}`);
  },

  modeInfo: (count, isManual) => {
    baseLog.raw(`${ICONS.create} Creating ${count} Time Off request(s)\n`);
    baseLog.raw(`Mode: ${isManual ? "MANUAL (you click Save)" : "AUTO"}\n`);
  },

  nothingToCreate: () => baseLog.info("Nothing to create. Run: node compare.js"),
  
  missingFile: (file) => {
    baseLog.error(`Missing data file: ${file}`);
    baseLog.raw("👉 Please run: node compare.js");
  },

  verifying: () => baseLog.indent("🔍 Verifying time off was created..."),
  
  verified: () => baseLog.indent(`${ICONS.success} Verified: Time off exists in system`),
  
  removed: (date) => baseLog.indent(`${ICONS.success} Removed ${date} from action-needed.json`),

  selectionWarning: (msg) => baseLog.raw(`   ${ICONS.warning}  ${msg}`),
};

/**
 * Data fetch modules logger (attendance, timeoff)
 */
const dataLogger = {
  saved: (count, filename) => baseLog.success(`Saved ${count} records to ${filename}`),
  notLoggedIn: () => {
    throw new Error("Not logged in. Run: node login.js --show");
  },
  genericError: (msg) => baseLog.error(msg),
};

/**
 * Enhanced debug logging for troubleshooting
 * @param {string} filename - Filename to save to (e.g., 'create-timeoff.json')
 * @param {string} action - Action name
 * @param {Object} data - Log data
 */
function debugLog(filename, action, data = {}) {
  try {
    const logFile = path.join(__dirname, "..", "..", "logs", filename);
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
