/**
 * Bemo Cloud Automation - Shared Config
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DEFAULT_BASE_URL = "https://bap.bemo-cloud.com";

function getBaseUrl() {
  if (process.env.BEMO_BASE_URL) {
    return process.env.BEMO_BASE_URL.replace(/\/$/, "");
  }

  if (process.env.BEMO_SUBDOMAIN) {
    return `https://${process.env.BEMO_SUBDOMAIN}.bemo-cloud.com`;
  }

  return DEFAULT_BASE_URL;
}

const BASE_URL = getBaseUrl();

/**
 * Find Chrome executable path automatically
 * @returns {string} Chrome executable path
 */
function findChromePath() {
  // Check environment variable first
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const homeDir = os.homedir();
  
  // Common Chrome paths to check
  const possiblePaths = [
    // Puppeteer cache (search for latest version)
    path.join(homeDir, ".cache/puppeteer/chrome"),
    // System Chrome installations
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    // Snap installation
    "/snap/bin/chromium",
  ];

  // First check system installations
  for (const chromePath of possiblePaths.slice(1)) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  // Check Puppeteer cache and find latest version
  const puppeteerCacheDir = possiblePaths[0];
  if (fs.existsSync(puppeteerCacheDir)) {
    try {
      const versions = fs.readdirSync(puppeteerCacheDir)
        .filter(dir => dir.startsWith("linux-"))
        .sort()
        .reverse(); // Latest version first

      for (const version of versions) {
        const chromePath = path.join(puppeteerCacheDir, version, "chrome-linux64/chrome");
        if (fs.existsSync(chromePath)) {
          return chromePath;
        }
      }
    } catch {
      // Ignore errors, will throw below
    }
  }

  throw new Error(
    "Chrome executable not found. Please install Chrome or set PUPPETEER_EXECUTABLE_PATH environment variable."
  );
}

module.exports = {
  // Paths (dynamic based on home directory)
  userDataDir: path.join(os.homedir(), ".puppeteer-profile"),

  // Data files
  dataFiles: {
    attendance: path.join(DATA_DIR, "attendance-data.json"),
    timeoff: path.join(DATA_DIR, "timeoff-data.json"),
    actionNeeded: path.join(DATA_DIR, "action-needed.json"),
  },

  // Chrome executable (auto-detected)
  get chromePath() {
    // Lazy evaluation - only find when accessed
    if (!this._chromePath) {
      this._chromePath = findChromePath();
    }
    return this._chromePath;
  },

  // Bemo URLs
  urls: {
    login: `${BASE_URL}/web/login`,
    timeoffCreate: `${BASE_URL}/web#action=278&model=hr.leave&view_type=calendar&cids=&menu_id=202`,
    checkInOut: `${BASE_URL}/web#action=267&cids=&menu_id=192`,
  },

  // Launch options
  getLaunchOptions: (headless = false) => ({
    headless,
    userDataDir: module.exports.userDataDir,
    executablePath: module.exports.chromePath,
    env: { DISPLAY: process.env.DISPLAY || ":1" },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }),
};
