#!/usr/bin/env node
/** Log in to Bemo again (headless Chrome, BEMO_USER/BEMO_PASS from .env). Usage: node src/commands/login.js */
const { login } = require("../browser/login");
const { say, fail } = require("../shared/report");

login()
  .then((result) => say(result === "already" ? "✅ Phiên đăng nhập vẫn còn hạn" : "✅ Đã đăng nhập Bemo"))
  .catch(fail);
