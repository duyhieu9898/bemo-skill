#!/usr/bin/env node
/** Sync attendance + time off and find late days. Usage: node src/commands/sync.js [--previous] */
const { sync } = require("../timeoff/sync");
const { say, fail } = require("../shared/report");

sync({ previous: process.argv.includes("--previous") })
  .then((categories) => say(`🔄 Đã đồng bộ: ${categories.needsAction.length} ngày đi trễ cần time-off`))
  .catch(fail);
