#!/usr/bin/env node
/**
 * Auto switch for scheduled jobs.
 * Usage: node src/commands/auto.js on | off | status
 */

const { readAuto, setAuto, describeAuto } = require("../timeoff/auto");
const { say, fail } = require("../shared/report");

const [command = "status"] = process.argv.slice(2);
try {
  if (command === "on" || command === "off") say(describeAuto(setAuto(command === "on")));
  else if (command === "status") say(describeAuto(readAuto()));
  else throw new Error("Usage: node src/commands/auto.js on | off | status");
} catch (err) {
  fail(err);
}
