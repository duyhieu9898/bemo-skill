#!/usr/bin/env node
/** Drop late days that already have time off on Bemo. Usage: node src/commands/verify-timeoff.js */
const { verifyAll } = require("../timeoff/verify");

verifyAll().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
