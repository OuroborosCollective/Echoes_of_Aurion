import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Hold the write end open while the GitHub step is alive. The injectable
// command is used only by isolated tests; the production CLI below invokes
// the fixed sudo entrypoint and passes the verified OIDC token on stdin.
export async function runJobChild({ command, args, authorization = null, stdout = "inherit", stderr = "inherit", onSpawn = () => {} }) {
  const parentPid = process.ppid;
  if (parentPid <= 1) return 125;
  const runner = spawn(command, args, { stdio: ["pipe", stdout, stderr] });
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    runner.stdin.end();
  };
  const parentWatch = setInterval(() => { if (process.ppid !== parentPid) cancel(); }, 200);
  parentWatch.unref();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  runner.stdin.on("error", () => {});
  onSpawn(runner);
  if (authorization !== null) runner.stdin.write(`${authorization}\n`);
  const result = await new Promise(resolve => {
    runner.once("error", () => resolve({ code: 125 }));
    runner.once("exit", (code, signal) => resolve({ code, signal }));
  });
  runner.stdin.destroy();
  clearInterval(parentWatch);
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
  return cancelled ? 130 : (result.code ?? 125);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , expectedSha, planSha256] = process.argv;
  const workspace = process.env.GITHUB_WORKSPACE;
  if (process.argv.length !== 4 || !path.isAbsolute(workspace ?? "") || !/^[a-f0-9]{40}$/.test(expectedSha ?? "") || !/^[a-f0-9]{64}$/.test(planSha256 ?? "")) process.exit(64);
  const authorization = readFileSync(path.join(workspace, "production-schema-apply.oidc"), "utf8").trim();
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization) || authorization.length > 16384) process.exit(77);
  const raw = openSync(path.join(workspace, "production-schema-apply.raw.json"), "w", 0o600);
  const stderr = openSync(path.join(workspace, "production-schema-apply.stderr"), "w", 0o600);
  try {
    process.exitCode = await runJobChild({
      command: "sudo",
      args: ["-n", "/usr/local/sbin/aurion-production-schema-apply", expectedSha, planSha256],
      authorization,
      stdout: raw,
      stderr,
    });
  } finally {
    closeSync(raw);
    closeSync(stderr);
  }
}
