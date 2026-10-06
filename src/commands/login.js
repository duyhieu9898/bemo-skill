#!/usr/bin/env node
/** Open Chrome to log in to Bemo again (needs a display). Usage: node src/commands/login.js */
const { login } = require("../browser/login");

login().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
