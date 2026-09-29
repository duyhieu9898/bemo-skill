const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { withCreateLock } = require("../src/timeoff/lock");

const tmpLock = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bemo-lock-")), "create.lock");

test("a second run is refused while the first holds the lock, and the lock is released after", async () => {
  const lockFile = tmpLock();
  let inner;
  await withCreateLock(async () => {
    inner = await withCreateLock(async () => "second", { lockFile }).catch((err) => err);
  }, { lockFile });

  assert.equal(inner.code, "BEMO_LOCKED");
  assert.equal(fs.existsSync(lockFile), false);
  assert.equal(await withCreateLock(async () => "again", { lockFile }), "again");
});

test("a lock left by a dead process is taken over", async () => {
  const lockFile = tmpLock();
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 2147483646, startedAt: "2026-01-01T00:00:00Z" }));

  assert.equal(await withCreateLock(async () => "ok", { lockFile }), "ok");
});

test("the lock is released when the work throws", async () => {
  const lockFile = tmpLock();
  await assert.rejects(withCreateLock(async () => { throw new Error("boom"); }, { lockFile }), /boom/);
  assert.equal(fs.existsSync(lockFile), false);
});
