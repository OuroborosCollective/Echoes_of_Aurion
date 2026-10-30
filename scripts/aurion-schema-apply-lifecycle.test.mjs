import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { supervise } from "../deploy/aurion-schema-apply-lifecycle.mjs";
import { runJobChild } from "../deploy/aurion-schema-apply-job-client.mjs";

const self = fileURLToPath(import.meta.url);
const image = process.env.AURION_SCHEMA_LIFECYCLE_TEST_IMAGE ?? "node:20-alpine";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(condition, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(100);
  }
  throw new Error(message);
}

function docker(...args) {
  return spawnSync("docker", args, { encoding: "utf8", timeout: 10000 });
}

if (process.argv[2] === "--guard") {
  const directory = process.argv[3];
  const mode = process.argv[4];
  const name = readFileSync(path.join(directory, "container"), "utf8");
  writeFileSync(path.join(directory, "guard.pid"), String(process.pid));
  writeFileSync(path.join(directory, "guard.uid"), String(process.getuid()));
  const worker = `set -eu
    name="$1"; dir="$2"; image="$3"; mode="$4"
    label="org.aurion.schema-apply-operation=$AURION_SCHEMA_APPLY_OPERATION"
    printf %s "$AURION_SCHEMA_APPLY_OPERATION" > "$dir/operation"
    if [ "$mode" = normal ]; then
      docker run --rm --network none --label "$label" --entrypoint /bin/sh "$image" -c 'exit 0'
      touch "$dir/after"
      exit 0
    fi
    if [ "$mode" = restore ]; then
      seconds="$(cat "$dir/sleep-seconds")"
      case "$seconds" in ''|*[!0-9]*) exit 64 ;; esac
      docker run -d --name "$name" --network none --label "$label" \
        --mount "type=bind,src=$dir/backup.sql.gz,dst=/recovery-input/production.sql.gz,readonly" \
        --mount "type=bind,src=$dir/restore.sh,dst=/recovery-input/restore.sh,readonly" \
        -e MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1 "$image" >/dev/null
      for n in $(seq 1 60); do
        if docker exec "$name" sh -c 'case "$(cat /proc/1/comm)" in mariadbd|mysqld) mariadb --protocol=socket -uroot -e "SELECT 1" >/dev/null ;; *) exit 1 ;; esac' 2>/dev/null; then break; fi
        sleep 1
      done
      docker exec "$name" sh /recovery-input/restore.sh &
      client=$!
      for n in $(seq 1 100); do
        if docker exec "$name" mariadb --protocol=socket -uroot -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND INFO LIKE '%SLEEP($seconds)%'" | grep -q '^1$'; then break; fi
        sleep 0.1
      done
      docker exec "$name" mariadb --protocol=socket -uroot -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND INFO LIKE '%SLEEP($seconds)%'" | grep -q '^1$'
      printf %s "$$" > "$dir/worker.pid"
      touch "$dir/ready"
      wait "$client"
      touch "$dir/after"
      exit 0
    fi
    if [ "$mode" = write ]; then
      database="$(cat "$dir/database")"
      docker run -d --rm --name "$name" --network "container:$database" --label "$label" \
        --mount "type=bind,src=$dir/write.sql,dst=/input/write.sql,readonly" --entrypoint /bin/sh "$image" \
        -c 'mariadb --protocol=tcp -h127.0.0.1 -uroot abort_effect_proof < /input/write.sql' >/dev/null
      for n in $(seq 1 100); do
        if docker exec "$database" mariadb --protocol=socket -uroot -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND INFO LIKE '%SLEEP(15)%'" | grep -q '^1$'; then break; fi
        sleep 0.1
      done
      docker exec "$database" mariadb --protocol=socket -uroot -N -e "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND INFO LIKE '%SLEEP(15)%'" | grep -q '^1$'
      touch "$dir/ready"
      docker wait "$name" >/dev/null
      touch "$dir/after"
      exit 0
    fi
    docker run -d --name "$name" --network none --label "$label" --entrypoint /bin/sh "$image" -c 'sleep 60' >/dev/null
    docker exec "$name" sh -c 'touch /tmp/started; sleep 30; touch /tmp/after' &
    client=$!
    until docker exec "$name" test -f /tmp/started; do sleep 0.1; done
    printf %s "$$" > "$dir/worker.pid"
    touch "$dir/ready"
    wait "$client"
    touch "$dir/after"`;
  try {
    process.exitCode = await supervise({ command: "bash", args: ["-c", worker, "fixture", name, directory, image, mode], stateDir: path.join(directory, "state") });
  } catch { process.exitCode = 125; }
} else if (process.argv[2] === "--controller") {
  const directory = process.argv[3];
  writeFileSync(path.join(directory, "controller.uid"), String(process.getuid()));
  process.exitCode = await runJobChild({
    command: "sudo",
    args: ["-n", "env", `AURION_SCHEMA_LIFECYCLE_TEST_IMAGE=${image}`, process.execPath, self, "--guard", directory, process.argv[4] ?? "cancel"],
    stdout: "ignore",
    stderr: "ignore",
    onSpawn: guard => writeFileSync(path.join(directory, "sudo.pid"), String(guard.pid)),
  });
} else if (process.argv[2] === "--step") {
  const directory = process.argv[3];
  const controller = spawn(process.execPath, [self, "--controller", directory, process.argv[4] ?? "cancel"], { stdio: "ignore" });
  writeFileSync(path.join(directory, "controller.pid"), String(controller.pid));
  await new Promise(resolve => controller.once("exit", resolve));
} else {
  test("successful supervised operation finishes and releases its fence", { timeout: 30000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-lifecycle-"));
    const name = `aurion-proof-${randomBytes(8).toString("hex")}`;
    writeFileSync(path.join(directory, "container"), name);
    const guard = spawn(process.execPath, [self, "--guard", directory, "normal"], { stdio: ["pipe", "ignore", "pipe"] });
    t.after(async () => {
      if (guard.exitCode === null && guard.signalCode === null) guard.kill("SIGKILL");
      docker("rm", "-f", name);
      await delay(1200);
      rmSync(directory, { recursive: true, force: true });
    });
    let errors = "";
    guard.stderr.on("data", chunk => { errors += chunk; });
    const result = await new Promise(resolve => guard.once("exit", (code, signal) => resolve({ code, signal })));
    guard.stdin.destroy();
    assert.equal(result.code, 0, errors);
    assert.equal(existsSync(path.join(directory, "after")), true);
    assert.equal(existsSync(path.join(directory, "state", ".active-operation")), false);
  });

  test("a killed job controller stops the real exec and its isolated container", { timeout: 45000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-lifecycle-"));
    const name = `aurion-proof-${randomBytes(8).toString("hex")}`;
    writeFileSync(path.join(directory, "container"), name);
    const controller = spawn(process.execPath, [self, "--controller", directory], { stdio: "ignore" });
    t.after(() => { try { controller.kill("SIGKILL"); } catch {} docker("rm", "-f", name); rmSync(directory, { recursive: true, force: true }); });
    await until(() => existsSync(path.join(directory, "ready")), "worker did not start");
    assert.equal(docker("inspect", name).status, 0);
    controller.kill("SIGKILL");
    await until(() => !existsSync(path.join(directory, "state", ".active-operation")), "cleanup fence remained");
    assert.notEqual(docker("inspect", name).status, 0);
    assert.equal(existsSync(path.join(directory, "after")), false);
    const operation = readFileSync(path.join(directory, "operation"), "utf8");
    const remaining = docker("ps", "-aq", "--filter", `label=org.aurion.schema-apply-operation=${operation}`);
    assert.equal(remaining.status, 0);
    assert.equal(remaining.stdout.trim(), "");
  });

  test("loss of the step parent closes the actual job-client lease", { timeout: 45000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-lifecycle-"));
    const name = `aurion-proof-${randomBytes(8).toString("hex")}`;
    writeFileSync(path.join(directory, "container"), name);
    const step = spawn(process.execPath, [self, "--step", directory], { stdio: "ignore" });
    t.after(() => { try { step.kill("SIGKILL"); } catch {} docker("rm", "-fv", name); rmSync(directory, { recursive: true, force: true }); });
    await until(() => existsSync(path.join(directory, "ready")), "worker did not start");
    step.kill("SIGKILL");
    await until(() => !existsSync(path.join(directory, "state", ".active-operation")), "lost-parent cleanup fence remained");
    assert.notEqual(docker("inspect", name).status, 0);
    assert.equal(existsSync(path.join(directory, "after")), false);
  });

  test("a killed privileged supervisor leaves its independent reaper to clean up", { timeout: 45000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-lifecycle-"));
    const name = `aurion-proof-${randomBytes(8).toString("hex")}`;
    writeFileSync(path.join(directory, "container"), name);
    const controller = spawn(process.execPath, [self, "--controller", directory], { stdio: "ignore" });
    t.after(() => { try { controller.kill("SIGKILL"); } catch {} docker("rm", "-f", name); rmSync(directory, { recursive: true, force: true }); });
    await until(() => existsSync(path.join(directory, "ready")) && existsSync(path.join(directory, "guard.pid")), "worker did not start");
    const guardPid = Number(readFileSync(path.join(directory, "guard.pid"), "utf8"));
    process.kill(guardPid, "SIGKILL");
    await until(() => !existsSync(path.join(directory, "state", ".active-operation")), "reaper did not clear fence");
    assert.notEqual(docker("inspect", name).status, 0);
    assert.equal(existsSync(path.join(directory, "after")), false);
  });

  test("cancelling an active MariaDB restore removes the recovery container before follow-up", { timeout: 60000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-lifecycle-"));
    const name = `aurion-proof-${randomBytes(8).toString("hex")}`;
    writeFileSync(path.join(directory, "container"), name);
    writeFileSync(path.join(directory, "sleep-seconds"), "25");
    copyFileSync(new URL("../deploy/aurion-schema-restore", import.meta.url), path.join(directory, "restore.sh"));
    const compressed = spawnSync("gzip", ["-n", "-c"], { input: "CREATE DATABASE abort_proof; USE abort_proof; SELECT SLEEP(25); CREATE TABLE must_not_run (id INT);\n" });
    assert.equal(compressed.status, 0);
    writeFileSync(path.join(directory, "backup.sql.gz"), compressed.stdout);
    const controller = spawn(process.execPath, [self, "--controller", directory, "restore"], { stdio: "ignore" });
    t.after(() => { try { controller.kill("SIGKILL"); } catch {} docker("rm", "-fv", name); rmSync(directory, { recursive: true, force: true }); });
    await until(() => existsSync(path.join(directory, "ready")), "isolated restore did not reach its running SQL statement", 40000);
    controller.kill("SIGKILL");
    await until(() => !existsSync(path.join(directory, "state", ".active-operation")), "restore cleanup fence remained");
    assert.notEqual(docker("inspect", name).status, 0);
    assert.equal(existsSync(path.join(directory, "after")), false);
  });

  test("cancelling a writer prevents its later SQL on an independent isolated database", { timeout: 60000 }, async t => {
    const directory = mkdtempSync(path.join(tmpdir(), "aurion-lifecycle-"));
    const name = `aurion-proof-${randomBytes(8).toString("hex")}`;
    const database = `aurion-db-proof-${randomBytes(8).toString("hex")}`;
    writeFileSync(path.join(directory, "container"), name);
    writeFileSync(path.join(directory, "database"), database);
    writeFileSync(path.join(directory, "write.sql"), "SELECT SLEEP(15);\nCREATE TABLE post_abort (id INT);\n");
    const start = docker("run", "-d", "--network", "none", "--name", database, "-e", "MARIADB_ALLOW_EMPTY_ROOT_PASSWORD=1", "-e", "MARIADB_ROOT_HOST=%", image);
    assert.equal(start.status, 0, start.stderr);
    let controller;
    t.after(() => { try { controller?.kill("SIGKILL"); } catch {} docker("rm", "-fv", name); docker("rm", "-fv", database); rmSync(directory, { recursive: true, force: true }); });
    await until(() => docker("exec", database, "sh", "-c", 'case "$(cat /proc/1/comm)" in mariadbd|mysqld) mariadb --protocol=socket -uroot -e "SELECT 1" >/dev/null ;; *) exit 1 ;; esac').status === 0, "isolated database did not start", 40000);
    const create = docker("exec", database, "mariadb", "--protocol=socket", "-uroot", "-e", "CREATE DATABASE abort_effect_proof");
    assert.equal(create.status, 0, create.stderr);
    controller = spawn(process.execPath, [self, "--controller", directory, "write"], { stdio: "ignore" });
    await until(() => existsSync(path.join(directory, "ready")), "writer did not enter the running statement", 20000);
    controller.kill("SIGKILL");
    await until(() => !existsSync(path.join(directory, "state", ".active-operation")), "writer cleanup fence remained");
    assert.notEqual(docker("inspect", name).status, 0);
    await until(() => {
      const query = docker("exec", database, "mariadb", "--protocol=socket", "-uroot", "-N", "-e", "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND INFO LIKE '%SLEEP(15)%'");
      return query.status === 0 && query.stdout.trim() === "0";
    }, "in-flight isolated statement did not settle", 20000);
    const readback = docker("exec", database, "mariadb", "--protocol=socket", "-uroot", "-N", "-e", "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='abort_effect_proof' AND TABLE_NAME='post_abort'");
    assert.equal(readback.status, 0, readback.stderr);
    assert.equal(readback.stdout.trim(), "0");
    assert.equal(existsSync(path.join(directory, "after")), false);
  });
}
