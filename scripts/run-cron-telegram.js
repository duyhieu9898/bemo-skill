#!/usr/bin/env node
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const projectDir = path.resolve(__dirname, "..");
const logDir = path.join(projectDir, "logs");
const runLog = path.join(logDir, "cron-run.log");

const telegramBotToken =
  process.env.TELEGRAM_BOT_TOKEN || "8556741894:AAFn29duC9iBGJMn7sBndtdkWKFzwQaey3o";
const telegramChatId = process.env.TELEGRAM_CHAT_ID || "811696951";
const jobCommand = process.env.JOB_COMMAND || "npm run checkout";

if (process.argv.includes("--help")) {
  console.log(`Usage: node scripts/run-cron-telegram.js

Environment:
  JOB_COMMAND            Command to run before sending Telegram response
  TELEGRAM_BOT_TOKEN     Telegram bot token
  TELEGRAM_CHAT_ID       Telegram chat id
  JOB_TIMEOUT_MS         Command timeout in milliseconds

Default command: npm run checkout`);
  process.exit(0);
}

fs.mkdirSync(logDir, { recursive: true });

function formatDate(date = new Date()) {
  return date.toLocaleString("sv-SE", {
    timeZone: process.env.TZ || "Asia/Ho_Chi_Minh",
    hour12: false,
    timeZoneName: "short",
  });
}

function tailLines(text, maxLines) {
  return text.trim().split(/\r?\n/).slice(-maxLines).join("\n") || "(không có output)";
}

async function sendTelegram(text) {
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text,
      disable_web_page_preview: true,
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
  const startedAt = formatDate();
  fs.appendFileSync(runLog, `\n===== ${startedAt} =====\nRunning command: ${jobCommand}\n`);

  const result = await runCommand(jobCommand);
  fs.appendFileSync(runLog, result.output);

  const finishedAt = formatDate();
  const ok = result.exitCode === 0 && !result.signal;
  const icon = ok ? "✅" : "❌";
  const title = ok ? "Bemo checkout thành công" : "Bemo checkout thất bại";
  const outputTitle = ok ? "📋 Kết quả:" : "📋 Lỗi gần nhất:";
  const exitLine = ok ? "" : `\n🔢 Exit code: ${result.exitCode || result.signal}`;

  const message = `${icon} ${title}
🕒 ${finishedAt}${exitLine}

${outputTitle}
${tailLines(result.output, ok ? 12 : 16)}`;

  await sendTelegram(message);

  if (!ok) {
    process.exit(result.exitCode || 1);
  }
}

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
