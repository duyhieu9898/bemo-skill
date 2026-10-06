#!/usr/bin/env node
/**
 * Auto switch for scheduled jobs.
 * Usage: node src/commands/auto.js on | off | status
 */

const { readAuto, setAuto, describeAuto } = require("../timeoff/auto");

const [command = "status"] = process.argv.slice(2);
try {
  if (command === "on" || command === "off") {
    console.log(describeAuto(setAuto(command === "on")));
  } else if (command === "status") {
    console.log(describeAuto(readAuto()));
  } else {
    throw new Error("Usage: node src/commands/auto.js on | off | status");
  }
} catch (err) {
  console.error("❌", err.message);
  process.exit(1);
}
