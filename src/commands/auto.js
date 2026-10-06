#!/usr/bin/env node
/**
 * Auto switch for scheduled jobs.
 * Usage: node src/commands/auto.js on | off | status
 */

const { readAuto, setAuto, describeAuto } = require("../timeoff/auto");

const [command = "status"] = process.argv.slice(2);
if (command === "on" || command === "off") {
  console.log(describeAuto(setAuto(command === "on")));
} else if (command === "status") {
  console.log(describeAuto(readAuto()));
} else {
  console.error("Usage: node src/commands/auto.js on | off | status");
  process.exit(1);
}
