import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const image = process.env.AURION_SCHEMA_LIFECYCLE_TEST_IMAGE;
const restore = fileURLToPath(new URL("../deploy/aurion-schema-restore", import.meta.url));
const docker = (...args) => spawnSync("docker", args, { encoding: "utf8", timeout: 30000 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function compressed(sql) {
  const result = spawnSync("gzip", ["-n", "-c"], { input: sql });
  assert.equal(result.status, 0);
  return result.stdout;
}

test("real isolated MariaDB restore requires complete gzip and SQL execution", { timeout: 90000 }, async t => {
  assert.ok(image, "AURION_SCHEMA_LIFECYCLE_TEST_IMAGE must identify a MariaDB image");
  const dir = mkdtempSync(path.join(tmpdir(), "aurion-restore-"));
  const name = `aurion-restore-proof-${randomBytes(8).toString("hex")}`;
  const backup = path.join(dir, "backup.sql.gz");
  writeFileSync(backup, compressed("CREATE DATABASE restore_proof; USE restore_proof; CREATE TABLE items (id INT); INSERT INTO items VALUES (7);\n"));
  t.after(() => { docker("rm", "-fv", name); if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });
  const start = docker("run", "-d", "--network", "none", "--name", name,
    "--mount", `type=bind,src=${backup},dst=/recovery-input/production.sql.gz,readonly`,
    "--mount", `type=bind,src=${restore},dst=/recovery-input/restore.sh,readonly`,
    "-e", "MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1", image);
  assert.equal(start.status, 0, start.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker("exec", name, "sh", "-c", 'case "$(cat /proc/1/comm)" in mariadbd|mysqld) mariadb --protocol=socket -uroot -e "SELECT 1" >/dev/null ;; *) exit 1 ;; esac');
    if (result.status === 0) { ready = true; break; }
    await pause(1000);
  }
  assert.equal(ready, true, "isolated MariaDB did not become ready");
  await t.test("successful restore has the completion marker and independently readable row", () => {
    const result = docker("exec", name, "sh", "/recovery-input/restore.sh");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "AURION_RECOVERY_RESTORE_COMPLETE");
    const readback = docker("exec", name, "mariadb", "--protocol=socket", "-uroot", "-N", "-e", "SELECT id FROM restore_proof.items");
    assert.equal(readback.status, 0, readback.stderr);
    assert.equal(readback.stdout.trim(), "7");
  });
  await t.test("corrupt gzip cannot emit completion", () => {
    writeFileSync(backup, "not a gzip stream\n");
    const result = docker("exec", name, "sh", "/recovery-input/restore.sh");
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.includes("AURION_RECOVERY_RESTORE_COMPLETE"), false);
  });
  await t.test("MariaDB SQL failure cannot emit completion", () => {
    writeFileSync(backup, compressed("USE restore_proof; THIS IS INVALID SQL;\n"));
    const result = docker("exec", name, "sh", "/recovery-input/restore.sh");
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.includes("AURION_RECOVERY_RESTORE_COMPLETE"), false);
  });
});
