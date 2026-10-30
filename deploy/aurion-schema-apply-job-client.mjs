import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

// Keep the write end of the authorization pipe open for the entire job step.
// The privileged side consumes one JWT line, then treats EOF as cancellation.
const [, , expectedSha, planSha256] = process.argv;
const workspace = process.env.GITHUB_WORKSPACE;
if (process.argv.length !== 4 || !path.isAbsolute(workspace ?? "") || !/^[a-f0-9]{40}$/.test(expectedSha ?? "") || !/^[a-f0-9]{64}$/.test(planSha256 ?? "")) process.exit(64);
const authorization = readFileSync(path.join(workspace, "production-schema-apply.oidc"), "utf8").trim();
if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization) || authorization.length > 16384) process.exit(77);
const raw = openSync(path.join(workspace, "production-schema-apply.raw.json"), "w", 0o600);
const stderr = openSync(path.join(workspace, "production-schema-apply.stderr"), "w", 0o600);
const runner = spawn("sudo", ["-n", "/usr/local/sbin/aurion-production-schema-apply", expectedSha, planSha256], { stdio: ["pipe", raw, stderr] });
closeSync(raw);
closeSync(stderr);
let cancelled = false;
const cancel = () => {
  cancelled = true;
  runner.stdin.end();
};
const parentPid = process.ppid;
const parentWatch = setInterval(() => { if (process.ppid !== parentPid) cancel(); }, 200);
parentWatch.unref();
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
runner.stdin.on("error", () => {});
runner.stdin.write(`${authorization}\n`);
const result = await new Promise(resolve => {
  runner.once("error", () => resolve({ code: 125 }));
  runner.once("exit", (code, signal) => resolve({ code, signal }));
});
runner.stdin.destroy();
clearInterval(parentWatch);
process.exitCode = cancelled ? 130 : (result.code ?? 125);
