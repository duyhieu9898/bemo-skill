#!/usr/bin/env node
/** Sync attendance + time off and find late days. Usage: node src/commands/sync.js [--previous] */
const { sync } = require("../timeoff/sync");

sync({ previous: process.argv.includes("--previous") }).catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
