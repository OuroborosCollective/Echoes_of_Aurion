import { spawn } from "node:child_process";

// This is only for the disposable GitHub-hosted MariaDB proof. Production
// enters through the OIDC-verifying sudo wrapper and the job client instead.
const [, , revision, plan] = process.argv;
if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || !/^[a-f0-9]{40}$/.test(revision ?? "") || !/^[a-f0-9]{64}$/.test(plan ?? "")) process.exit(64);
const guard = spawn("sudo", ["-n", process.execPath, `/opt/echoes-of-aurion-schema-apply/releases/${revision}/deploy/aurion-schema-apply-lifecycle.mjs`, revision, plan], { stdio: ["pipe", "inherit", "inherit"] });
guard.stdin.on("error", () => {});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => guard.stdin.end());
const status = await new Promise(resolve => {
  guard.once("error", () => resolve(125));
  guard.once("exit", code => resolve(code ?? 125));
});
guard.stdin.destroy();
process.exitCode = status;
