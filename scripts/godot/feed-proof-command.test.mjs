// Real Linux subprocess regressions. These are CI fixtures, never game/runtime evidence.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBoundedFeedProofCommand } from "./feed-proof-command.mjs";

/** Preserve a normal successful command and its captured output. */
function normalCommand() {
  const result = runBoundedFeedProofCommand(process.execPath, ["-e", "process.stdout.write('bounded-output')"]);
  assert.equal(result.status, 0);
  assert.equal(result.error, undefined);
  assert.equal(result.stdout, "bounded-output");
}

/** A nonzero child exit must remain a failure and must not become a timeout. */
function failedCommand() {
  const result = runBoundedFeedProofCommand(process.execPath, ["-e", "process.exit(7)"]);
  assert.equal(result.status, 7);
  assert.equal(result.error, undefined);
}

/** Recognize a terminated child, including a short-lived unreaped Linux zombie. */
function terminated(pid) {
  try {
    const state = fs.readFileSync("/proc/" + pid + "/stat", "utf8").split(") ")[1][0];
    return state === "Z" || state === "X";
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

/** Exercise an actual TERM-ignoring parent and descendant with inherited pipes. */
async function stalledSubtree() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aurion-proof-timeout-"));
  const pidFile = path.join(directory, "child.pid");
  let childPid;
  try {
    const childCode = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
    const code = 'import { spawn } from "node:child_process"; import fs from "node:fs"; process.on("SIGTERM", () => {}); '
      + 'const child=spawn(process.execPath,["-e",' + JSON.stringify(childCode) + '],{stdio:["ignore","inherit","inherit"]}); '
      + 'fs.writeFileSync(' + JSON.stringify(pidFile) + ',String(child.pid)); setInterval(() => {},1000);';
    const result = runBoundedFeedProofCommand(process.execPath, ["--input-type=module", "-e", code], { timeoutSeconds: 1, graceSeconds: 1 });
    assert.equal(result.error?.code, "ETIMEDOUT");
    assert.notEqual(result.status, 0);
    childPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(Number.isSafeInteger(childPid) && childPid > 1);
    for (let attempt = 0; attempt < 20 && !terminated(childPid); attempt++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(terminated(childPid), true, "deadline must terminate the descendant, not only pnpm/the parent");
  } finally {
    if (childPid && !terminated(childPid)) process.kill(childPid, "SIGKILL");
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("normal command exits successfully", normalCommand);
test("nonzero child exit remains failure", failedCommand);
test("deadline kills a TERM-ignoring child process group", { timeout: 10000 }, stalledSubtree);
