#!/usr/bin/env node

const crypto = require("node:crypto");

const CONFIG = require("../shared/config");
const BUSINESS = require("../timeoff/business-rules");
const { createTimeOff } = require("../timeoff/create");
const { loadJSON, toIsoDate } = require("../shared");

const PLAN_VERSION = 1;
const ACTION_FILE = CONFIG.dataFiles.actionNeeded;

function normalizeDate(value) {
  const iso = toIsoDate(value);
  if (!iso) throw new Error(`Invalid date: ${String(value)}`);
  return iso;
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") throw new Error("Late record must be an object.");
  const canonicalDate = normalizeDate(record.date);
  if (typeof record.checkInDateTime !== "string" || !record.checkInDateTime.trim()) {
    throw new Error(`Late record ${canonicalDate} is missing checkInDateTime.`);
  }
  if (!Number.isFinite(record.lateMinutes) || record.lateMinutes <= 0) {
    throw new Error(`Late record ${canonicalDate} has invalid lateMinutes.`);
  }
  return {
    date: record.date,
    canonicalDate,
    checkInDateTime: record.checkInDateTime,
    lateMinutes: record.lateMinutes,
    reason: typeof record.reason === "string" ? record.reason : BUSINESS.lateArrival.defaultReason,
  };
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) throw new Error("Late records must be an array.");
  const normalized = records
    .map(normalizeRecord)
    .sort((a, b) => a.canonicalDate.localeCompare(b.canonicalDate));
  const dates = normalized.map((record) => record.canonicalDate);
  if (new Set(dates).size !== dates.length) throw new Error("Late records contain duplicate dates.");
  return normalized;
}

function digestRecords(records) {
  return crypto.createHash("sha256").update(JSON.stringify(normalizeRecords(records))).digest("hex");
}

function buildPlan(actionData, skipDates = [], options = {}) {
  if (!actionData || typeof actionData !== "object") throw new Error("Action-needed data is missing.");
  const records = normalizeRecords(actionData.records);
  const normalizedSkips = skipDates.map(normalizeDate).sort();
  if (new Set(normalizedSkips).size !== normalizedSkips.length) {
    throw new Error("Skip dates contain duplicates.");
  }
  const available = new Set(records.map((record) => record.canonicalDate));
  const unknown = normalizedSkips.filter((date) => !available.has(date));
  if (unknown.length) throw new Error(`Skip dates are not in the late list: ${unknown.join(", ")}`);
  const skipped = new Set(normalizedSkips);
  const selected = records.filter((record) => !skipped.has(record.canonicalDate));
  const createdAt = options.createdAt || new Date().toISOString();
  const expiresAt = options.expiresAt || new Date(Date.parse(createdAt) + 2 * 60 * 1000).toISOString();

  return {
    version: PLAN_VERSION,
    sourceTimestamp: typeof actionData.timestamp === "string" ? actionData.timestamp : "unknown",
    createdAt,
    expiresAt,
    skippedDates: normalizedSkips,
    createDates: selected.map((record) => record.canonicalDate),
    sourceDigest: digestRecords(records),
    selectedDigest: digestRecords(selected),
  };
}

function validatePlan(plan, actionData, now = new Date()) {
  if (!plan || typeof plan !== "object") throw new Error("Approved plan is missing.");
  if (plan.version !== PLAN_VERSION) throw new Error(`Unsupported approved plan version: ${plan.version}`);
  if (typeof plan.expiresAt !== "string" || !Number.isFinite(Date.parse(plan.expiresAt))) {
    throw new Error("Approved plan expiry is invalid.");
  }
  if (Date.parse(plan.expiresAt) <= now.getTime()) throw new Error("Approved plan has expired.");
  const records = normalizeRecords(actionData?.records);
  if (digestRecords(records) !== plan.sourceDigest) throw new Error("Late-day source changed after preview.");
  const skippedDates = (plan.skippedDates || []).map(normalizeDate);
  const createDates = (plan.createDates || []).map(normalizeDate);
  if (new Set([...skippedDates, ...createDates]).size !== skippedDates.length + createDates.length) {
    throw new Error("Approved plan date sets overlap or contain duplicates.");
  }
  const createSet = new Set(createDates);
  const selected = records.filter((record) => createSet.has(record.canonicalDate));
  if (selected.length !== createDates.length || digestRecords(selected) !== plan.selectedDigest) {
    throw new Error("Approved plan selected dates do not match the current records.");
  }
  return { ...plan, skippedDates, createDates, records: selected };
}

function listLateRecords(actionData) {
  const records = normalizeRecords(actionData?.records || []);
  return {
    sourceTimestamp: typeof actionData?.timestamp === "string" ? actionData.timestamp : null,
    count: records.length,
    records: records.map(({ canonicalDate, checkInDateTime, lateMinutes }) => ({
      date: canonicalDate,
      checkInDateTime,
      lateMinutes,
    })),
  };
}

async function executePlan(plan, actionData, options = {}) {
  const validated = validatePlan(plan, actionData, options.now || new Date());
  const create = options.create || createTimeOff;
  const summary = await create(validated.records);
  return {
    sourceDigest: validated.sourceDigest,
    skippedDates: validated.skippedDates,
    selectedDates: validated.createDates,
    createdDates: summary.created.map((record) => normalizeDate(record.canonicalDate || record.date)),
    unverifiedDates: (summary.unverified || []).map((record) => normalizeDate(record.canonicalDate || record.date)),
    unverified: (summary.unverified || []).map((record) => ({
      date: normalizeDate(record.canonicalDate || record.date),
      id: record.id,
      mismatches: record.mismatches || [],
    })),
    failed: summary.failed.map((item) => ({ ...item, date: normalizeDate(item.date) })),
    skipped: summary.skipped.map((item) => ({ ...item, date: normalizeDate(item.date) })),
  };
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) throw new Error("Structured JSON input is required on stdin.");
  return JSON.parse(text);
}

async function main() {
  const command = process.argv[2];
  const actionData = loadJSON(ACTION_FILE);
  if (!actionData) throw new Error("Run Bemo sync before using the late-day workflow.");

  if (command === "list") {
    process.stdout.write(`${JSON.stringify(listLateRecords(actionData), null, 2)}\n`);
    return;
  }
  if (command === "prepare") {
    const input = await readStdinJson();
    const plan = buildPlan(actionData, input.skipDates || []);
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }
  if (command === "create") {
    const plan = await readStdinJson();
    const result = await executePlan(plan, actionData);
    process.stdout.write(`BEMO_WORKFLOW_RESULT=${JSON.stringify(result)}\n`);
    if (result.unverified.length) {
      const detail = result.unverified.map((u) => `#${u.id} ${u.date}: ${u.mismatches.join("; ")}`).join(" | ");
      throw new Error(`Saved but differs from the request, check in Bemo and do NOT recreate: ${detail}`);
    }
    if (result.failed.length) throw new Error(`${result.failed.length} selected time-off request(s) failed.`);
    return;
  }
  throw new Error("Usage: late-timeoff.js <list|prepare|create>");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bemo workflow failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  buildPlan,
  digestRecords,
  executePlan,
  listLateRecords,
  normalizeDate,
  normalizeRecords,
  validatePlan,
};
