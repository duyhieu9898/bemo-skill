#!/usr/bin/env node
/** Drop late days that already have time off on Bemo. Usage: node src/commands/verify-timeoff.js */
const { verifyAll, formatVerify } = require("../timeoff/verify");
const { say, fail } = require("../shared/report");

verifyAll().then((counts) => say(formatVerify(counts))).catch(fail);
