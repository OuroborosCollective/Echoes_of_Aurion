import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const core = await readFile(new URL("../deploy/aurion-production-schema-apply-core", import.meta.url), "utf8");
const execFileAsync = promisify(execFile);

function functionBody(name, nextName) {
  const start = core.indexOf(`${name}() {`);
  const end = core.indexOf(`\n${nextName}() {`, start);
  assert.notEqual(start, -1, `${name} function must remain present`);
  assert.notEqual(end, -1, `${nextName} function must remain after ${name}`);
  return core.slice(start, end);
}

test("production and recovery dump boundaries are bounded and signal-aware", () => {
  for (const [name, nextName] of [["production_client", "recovery_client"], ["recovery_client", "run_reconcile"]]) {
    const body = functionBody(name, nextName);
    assert.match(body, /if \[ "\$mode" = dump \]; then/);
    assert.match(body, /timeout --foreground --signal=TERM --kill-after=30s 900s/);
    assert.match(body, /"\$client"/);
  }
  assert.equal((core.match(/timeout --foreground --signal=TERM --kill-after=30s 900s/g) ?? []).length, 2);
});

test("query paths remain direct and are not silently put behind dump timeout", () => {
  for (const [name, nextName] of [["production_client", "recovery_client"], ["recovery_client", "run_reconcile"]]) {
    const body = functionBody(name, nextName);
    assert.match(body, /timeout --foreground/);
    assert.match(body, /else\n\s+"\$client"/);
  }
});

test("bounded MariaDB-dump command terminates a hung dump with timeout status", async () => {
  await assert.rejects(
    execFileAsync("timeout", [
      "--foreground",
      "--signal=TERM",
      "--kill-after=30s",
      "1s",
      process.execPath,
      "-e",
      "setTimeout(() => {}, 10000)",
    ]),
    error => error?.code === 124,
  );
});

test("cleanup failure preserves the first stage and exit status in an isolated shell", () => {
  const start = core.indexOf("on_exit() {");
  const end = core.indexOf("\ntrap on_exit EXIT", start);
  assert.ok(start >= 0 && end > start);
  const onExit = core.slice(start, end);
  for (const [initialStatus, expectedStatus, expectedPhase] of [[73, 73, "REPAIR_REHEARSAL_FAILED"], [0, 70, "RECOVERY_CLEANUP_FAILED"]]) {
    const script = `phase=REPAIR_REHEARSAL_FAILED
receipt_emitted=0
recovery_cleanup_failed=false
apply_raw=''
cleanup_recovery() { return 1; }
emit_failure() { printf '%s|%s|%s' "$phase" "$1" "$recovery_cleanup_failed"; }
${onExit}
trap on_exit EXIT
exit ${initialStatus}`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.stdout, `${expectedPhase}|${expectedStatus}|true`);
  }
});
