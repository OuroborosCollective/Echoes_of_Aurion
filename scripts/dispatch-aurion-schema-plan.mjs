import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const repository = "OuroborosCollective/Echoes_of_Aurion";
const workflow = "aurion-production-schema-apply.yml";
const tags = ["0021_aurion_global_world_state", "0022_aurion_world_chunk_deltas", "0023_aurion_world_presence_epochs", "0024_aurion_world_epoch_reactions", "0025_aurion_loot_mastery_ethos", "0026_aurion_faction_questline_state", "0027_aurion_faction_questline_rewards", "0028_aurion_world_checkpoint", "0029_aurion_guild_kingdom_authority", "0030_aurion_guild_bank_economy", "0031_aurion_profession_crafting_persistence"];

export function validateSchemaDispatchPlan({ manifest, expectedSha, planSha256, ledgerRunId }) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha ?? "") || !/^[a-f0-9]{64}$/.test(planSha256 ?? "") || !/^[1-9][0-9]*$/.test(ledgerRunId ?? "")) throw new Error("SCHEMA_DISPATCH_IDENTITY_INVALID");
  if (manifest?.waveId !== "aurion-production-0021-0031" || manifest.schemaVersion !== "aurion.migration-wave-manifest.v2" || manifest.policy?.ownerApprovalRequired !== true || manifest.policy?.productionWritesScheduled !== false || manifest.migrations?.map(entry => entry.tag).join(",") !== tags.join(",")) throw new Error("SCHEMA_DISPATCH_WAVE_NOT_AUTHORIZED");
}

export async function dispatchSchemaPlan(input, { request, pause, attempts = 260 }) {
  validateSchemaDispatchPlan(input);
  const prefix = `/repos/${repository}`;
  const caller = await request(`${prefix}/actions/runs/${input.ledgerRunId}`);
  if (caller.head_sha !== input.expectedSha || caller.head_branch !== "main" || !["push", "workflow_dispatch"].includes(caller.event) || caller.path !== ".github/workflows/deploy-aurion-zone-runtime.yml") throw new Error("SCHEMA_DISPATCH_CALLER_INVALID");
  const main = await request(`${prefix}/git/ref/heads/main`);
  if (main.object?.sha !== input.expectedSha) throw new Error("SCHEMA_DISPATCH_STALE_MAIN");
  // Keep the existing workflow_dispatch + exact SHA/plan OIDC authorization.
  // The apply workflow independently validates ledger hashes and backup/recovery.
  const dispatched = await request(`${prefix}/actions/workflows/${workflow}/dispatches`, "POST", { ref: "main", inputs: { ledger_run_id: input.ledgerRunId, plan_sha256: input.planSha256 } });
  const runId = dispatched.workflow_run_id;
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error("SCHEMA_DISPATCH_RUN_ID_MISSING");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const run = await request(`${prefix}/actions/runs/${runId}`);
    if (run.head_sha !== input.expectedSha || run.event !== "workflow_dispatch" || run.path !== `.github/workflows/${workflow}`) throw new Error("SCHEMA_DISPATCH_RUN_MISMATCH");
    if (run.status === "completed") {
      if (run.conclusion !== "success") throw new Error(`SCHEMA_APPLY_RUN_FAILED:${runId}`);
      return { sourceRevision: input.expectedSha, planSha256: input.planSha256, applyRunId: runId, conclusion: "success" };
    }
    await pause();
  }
  throw new Error(`SCHEMA_APPLY_RUN_TIMEOUT:${runId}`);
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN_REQUIRED");
  const result = await dispatchSchemaPlan({
    manifest: JSON.parse(await readFile("config/aurion-migration-wave-manifest.json", "utf8")),
    expectedSha: process.env.AURION_EXPECTED_SHA, planSha256: process.env.AURION_PLAN_SHA256, ledgerRunId: process.env.AURION_LEDGER_RUN_ID,
  }, {
    request: async (path, method = "GET", body) => {
      const response = await fetch(`https://api.github.com${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`GITHUB_SCHEMA_DISPATCH_HTTP_${response.status}`);
      return response.json();
    },
    pause: () => new Promise(resolve => setTimeout(resolve, 15_000)),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
