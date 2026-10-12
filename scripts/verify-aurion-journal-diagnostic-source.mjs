import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repository = "OuroborosCollective/Echoes_of_Aurion";
const shaPattern = /^[a-f0-9]{40}$/;
const invalid = () => new Error("DIAGNOSTIC_ARTIFACT_SOURCE_INVALID");

export async function verifyDiagnosticSource(env, local, request = fetch) {
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== "refs/heads/main" ||
      !shaPattern.test(env.EXPECTED_SHA ?? "") || !shaPattern.test(env.PREPARED_SHA ?? "") ||
      !/^[1-9][0-9]*$/.test(env.ARTIFACT_RUN_ID ?? "") ||
      !Number.isSafeInteger(Number(env.ARTIFACT_RUN_ID)) ||
      env.GITHUB_SHA !== env.EXPECTED_SHA || local.head !== env.EXPECTED_SHA ||
      !shaPattern.test(local.drizzle ?? "") || !env.GH_TOKEN) throw invalid();

  async function api(path) {
    try {
      const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "Cache-Control": "no-cache" },
      });
      if (!response.ok) throw invalid();
      return await response.json();
    } catch { throw new Error("DIAGNOSTIC_GITHUB_READ_FAILED"); }
  }

  const main = await api("git/ref/heads/main");
  if (main.object?.sha !== env.EXPECTED_SHA) throw invalid();
  const commit = await api(`git/commits/${env.PREPARED_SHA}`);
  if (!shaPattern.test(commit.tree?.sha ?? "")) throw invalid();
  const tree = await api(`git/trees/${commit.tree.sha}`);
  const drizzle = Array.isArray(tree.tree) ? tree.tree.filter(t => t.path === "drizzle" && t.type === "tree") : [];
  if (tree.truncated === true || drizzle.length !== 1 || drizzle[0].sha !== local.drizzle) throw invalid();
  const run = await api(`actions/runs/${env.ARTIFACT_RUN_ID}`);
  if (run.id !== Number(env.ARTIFACT_RUN_ID) || run.head_sha !== env.PREPARED_SHA ||
      run.head_branch !== "main" || run.event !== "workflow_dispatch" ||
      run.path !== ".github/workflows/deploy-aurion-zone-runtime.yml" ||
      run.repository?.id !== 1313103794 || run.repository?.owner?.id !== 266194342) throw invalid();
  return { sourceRevision: env.EXPECTED_SHA, preparedRevision: env.PREPARED_SHA, sourceRunId: run.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const git = ref => execFileSync("git", ["rev-parse", ref], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const result = await verifyDiagnosticSource(process.env, { head: git("HEAD"), drizzle: git("HEAD:drizzle") });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error?.message === "DIAGNOSTIC_GITHUB_READ_FAILED" ? error.message : "DIAGNOSTIC_ARTIFACT_SOURCE_INVALID");
    process.exitCode = 1;
  }
}
