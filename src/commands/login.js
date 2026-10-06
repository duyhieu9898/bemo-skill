#!/usr/bin/env node
/** Log in to Bemo again (headless Chrome, BEMO_USER/BEMO_PASS from .env). Usage: node src/commands/login.js */
const { login } = require("../browser/login");

login().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
