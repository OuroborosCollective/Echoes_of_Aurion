import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

test("backup retention keeps the newest verified backups and never touches unknown or protected files", () => {
  const prune = functionBody("prune_schema_backups", "production_client");
  const dir = mkdtempSync(path.join(tmpdir(), "aurion-backup-retention-"));
  try {
    const name = (i, suffix = "") => `${String(i).padStart(40, "a")}-${"b".repeat(16)}-202610${String(i).padStart(2, "0")}T000000Z${suffix}.sql.gz`;
    const canonical = Array.from({ length: 14 }, (_, i) => name(i + 1, i === 13 ? "-refreshed" : ""));
    canonical.forEach((file, i) => {
      writeFileSync(path.join(dir, file), "x");
      const t = new Date(Date.UTC(2026, 9, i + 1));
      utimesSync(path.join(dir, file), t, t);
    });
    // Oldest canonical file is this run's verified backup: it must survive.
    const protectedFile = path.join(dir, canonical[0]);
    for (const other of ["notes.txt", `.${name(99)}.tmp123`, "partial.sql.gz"]) writeFileSync(path.join(dir, other), "x");
    const run = (keep, protectedPath = protectedFile) => spawnSync("bash", ["-c", `set -euo pipefail\n${prune}\nprune_schema_backups "$1" "$2" "$3"`, "_", dir, String(keep), protectedPath], { encoding: "utf8" });

    for (const invalid of ["1", "x", ""]) {
      assert.notEqual(run(invalid).status, 0, `keep=${JSON.stringify(invalid)} must be rejected`);
      assert.equal(readdirSync(dir).length, 17, "invalid retention must not delete anything");
    }
    assert.notEqual(run(10, path.join(dir, "missing.sql.gz")).status, 0, "missing protected backup must be rejected");
    assert.equal(readdirSync(dir).length, 17);

    const result = run(5);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /kept newest 5, removed 8/);
    const remaining = new Set(readdirSync(dir));
    for (const file of canonical.slice(9)) assert.ok(remaining.has(file), `newest backup ${file} must be kept`);
    for (const file of canonical.slice(1, 9)) assert.ok(!remaining.has(file), `old backup ${file} must be removed`);
    assert.ok(remaining.has(canonical[0]), "protected verified backup must be kept");
    for (const other of ["notes.txt", `.${name(99)}.tmp123`, "partial.sql.gz"]) assert.ok(remaining.has(other), `${other} must be untouched`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup retention runs only after recovery proof and cleanup, before production DDL", () => {
  const recovery = core.indexOf("phase=ISOLATED_RECOVERY_PROOF");
  const cleanup = core.indexOf("cleanup_recovery || { phase=RECOVERY_CLEANUP_FAILED; exit 70; }");
  const retention = core.indexOf('prune_schema_backups "$backup_dir" "$backup_keep" "$backup_file" || echo "schema backup retention skipped" >&2');
  const apply = core.indexOf("phase=APPLY_SCHEMA");
  assert.ok(recovery > 0 && cleanup > recovery && retention > cleanup && apply > retention);
  assert.match(core, /^backup_keep=5$/m);
});
