#!/usr/bin/env node
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ quiet: true });

const projectDir = path.resolve(__dirname, "..");
const logDir = path.join(projectDir, "logs");
const runLog = path.join(logDir, "cron-run.log");

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const jobCommand = process.env.JOB_COMMAND || "npm run -s checkout:scheduled";
const { SKIPPED } = require("../src/shared/exit-codes");

if (process.argv.includes("--help")) {
  console.log(`Usage: node scripts/run-cron-telegram.js

Environment:
  JOB_COMMAND            Command to run before sending Telegram response
  TELEGRAM_BOT_TOKEN     Telegram bot token
  TELEGRAM_CHAT_ID       Telegram chat id
  JOB_TIMEOUT_MS         Command timeout in milliseconds

Default command: npm run -s checkout:scheduled (exit 10 = skipped while the auto switch is off: npm run auto -- off)`);
  process.exit(0);
}

function formatDate(date = new Date()) {
  return date.toLocaleString("sv-SE", {
    timeZone: process.env.TZ || "Asia/Ho_Chi_Minh",
    hour12: false,
    timeZoneName: "short",
  });
}

/**
 * @param {{exitCode: number, signal?: string|null}} result
 * @returns {{ok: boolean, icon: string, title: string}}
 */
function describeResult({ exitCode, signal }) {
  if (signal) return { ok: false, icon: "❌", title: "Bemo checkout thất bại" };
  if (exitCode === SKIPPED) return { ok: true, icon: "⏸️", title: "Bemo checkout bỏ qua" };
  if (exitCode === 0) return { ok: true, icon: "✅", title: "Bemo checkout thành công" };
  return { ok: false, icon: "❌", title: "Bemo checkout thất bại" };
}

const MARK = "» ";

/**
 * Telegram text + inline buttons for one cron run: summary lines first, log only when it failed
 * @param {{exitCode: number, signal?: string|null, output: string}} result
 * @param {string} finishedAt
 * @returns {{text: string, buttons: Array<{text: string, callback_data: string}>}}
 */
function cronMessage(result, finishedAt) {
  const { ok, icon, title } = describeResult(result);
  const lines = result.output.trim().split(/\r?\n/).filter(Boolean);
  const summary = lines.filter((l) => l.startsWith(MARK)).map((l) => l.slice(MARK.length));
  const log = lines.filter((l) => !l.startsWith(MARK));
  const exitLine = ok ? "" : `\n🔢 Exit code: ${result.exitCode || result.signal}`;
  let body;
  if (!summary.length) body = `📋 ${ok ? "Kết quả" : "Lỗi gần nhất"}:\n${log.slice(-16).join("\n") || "(không có output)"}`;
  else body = summary.join("\n") + (ok ? "" : `\n\n📋 Log:\n${log.slice(-10).join("\n")}`);
  const buttons = [];
  if (result.exitCode === SKIPPED && summary.some((l) => l.includes("Tự động: TẮT"))) {
    buttons.push({ text: "⚙️ Bật lại tự động", callback_data: "cmd:bemo_auto_on" });
  }
  buttons.push({ text: "📋 Menu", callback_data: "menu" });
  return { text: `${icon} ${title}\n🕒 ${finishedAt}${exitLine}\n\n${body}`, buttons };
}

async function sendTelegram(text, buttons = []) {
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text,
      disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status} ${await response.text()}`);
  }
}

function runCommand(command) {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: projectDir,
        env: { ...process.env },
        shell: "/bin/bash",
        timeout: Number(process.env.JOB_TIMEOUT_MS || 10 * 60 * 1000),
        maxBuffer: 1024 * 1024 * 10,
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error?.code || 0,
          signal: error?.signal,
          output: `${stdout || ""}${stderr || ""}`,
        });
      },
    );
  });
}

async function main() {
  fs.mkdirSync(logDir, { recursive: true });
  if (!telegramBotToken || !telegramChatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment");
  }

  const startedAt = formatDate();
  fs.appendFileSync(runLog, `\n===== ${startedAt} =====\nRunning command: ${jobCommand}\n`);

  const result = await runCommand(jobCommand);
  fs.appendFileSync(runLog, result.output);

  const finishedAt = formatDate();
  const { ok } = describeResult(result);
  const { text, buttons } = cronMessage(result, finishedAt);
  await sendTelegram(text, buttons);

  if (!ok) {
    process.exit(result.exitCode || 1);
  }
}

// Runs the real job (a Bemo checkout): only when started directly, never on require().
if (require.main === module) {
  main().catch((error) => {
    const message = `❌ Bemo checkout thất bại
🕒 ${formatDate()}

📋 Lỗi gần nhất:
${error.message}`;

    sendTelegram(message)
      .catch(() => {})
      .finally(() => {
        console.error(error);
        process.exit(1);
      });
  });
}

module.exports = { describeResult, cronMessage };
