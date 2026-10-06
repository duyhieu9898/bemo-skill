const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const { scripts } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("every node/bash script file referenced by package.json exists", () => {
  for (const [name, command] of Object.entries(scripts)) {
    for (const [, file] of command.matchAll(/(?:node|bash) ((?:src|scripts)\/\S+)/g)) {
      assert.ok(fs.existsSync(path.join(root, file)), `${name}: ${file} is missing`);
    }
  }
});
