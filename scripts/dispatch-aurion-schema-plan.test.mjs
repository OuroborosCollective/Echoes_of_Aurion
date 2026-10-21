import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dispatchSchemaPlan } from "./dispatch-aurion-schema-plan.mjs";

const input = { manifest: JSON.parse(await readFile(new URL("../config/aurion-migration-wave-manifest.json", import.meta.url), "utf8")), expectedSha: "a".repeat(40), planSha256: "b".repeat(64), ledgerRunId: "123" };
function harness(overrides = {}) {
  const writes = [];
  return { writes, pause: async () => {}, attempts: 2, request: async (path, method, body) => {
    if (method === "POST") { writes.push({ path, body }); return body?.return_run_details === true ? { workflow_run_id: 456 } : {}; }
    if (path.endsWith("/123")) return { head_sha: input.expectedSha, head_branch: "main", event: "push", run_attempt: 1, path: ".github/workflows/deploy-aurion-zone-runtime.yml", ...overrides.caller };
    if (path.includes("/workflows/aurion-production-schema-apply.yml/runs?")) return { workflow_runs: overrides.activeRuns ?? [] };
    if (path.endsWith("/heads/main")) return { object: { sha: overrides.main ?? input.expectedSha } };
    return { head_sha: input.expectedSha, event: "workflow_dispatch", path: ".github/workflows/aurion-production-schema-apply.yml", status: "completed", conclusion: "success", ...overrides.run };
  } };
}

test("dispatches exactly one revision/plan-bound apply and waits for that run", async () => {
  const api = harness();
  assert.equal((await dispatchSchemaPlan(input, api)).applyRunId, 456);
  assert.equal(api.writes.length, 1);
  assert.deepEqual(api.writes[0].body, { ref: "main", return_run_details: true, inputs: { ledger_run_id: "123", plan_sha256: input.planSha256 } });
});
test("future waves, PR callers and stale main fail before any dispatch", async () => {
  const futureManifest={...input.manifest,waveId:"aurion-production-0021-0060",migrations:[...input.manifest.migrations,{tag:"0060_unreviewed_future_wave",source:"aurion"}]};
  for (const [value, options] of [[{ ...input, manifest: futureManifest }, {}], [input, { caller: { event: "pull_request" } }], [input, { main: "c".repeat(40) }]]) {
    const api = harness(options);
    await assert.rejects(dispatchSchemaPlan(value, api));
    assert.equal(api.writes.length, 0);
  }
});
test("a stale 0034 plan cannot dispatch the current 0041 apply contract", async () => {
  const api = harness();
  await assert.rejects(dispatchSchemaPlan({ ...input, manifest: {
    ...input.manifest, migrations: input.manifest.migrations.slice(0, 14),
  } }, api), /SCHEMA_DISPATCH_WAVE_NOT_AUTHORIZED/);
  assert.equal(api.writes.length, 0);
});
test("failed, mismatched and unfinished apply runs never count as successful", async () => {
  for (const run of [{ conclusion: "failure" }, { head_sha: "c".repeat(40) }, { status: "in_progress" }]) {
    const api = harness({ run });
    await assert.rejects(dispatchSchemaPlan(input, api));
    assert.equal(api.writes.length, 1);
  }
});

test("parent rerun refuses to dispatch second production schema operation", async () => {
  const api=harness({caller:{run_attempt:2}});
  await assert.rejects(dispatchSchemaPlan(input,api),/SCHEMA_DISPATCH_PARENT_RETRY_FORBIDDEN/);
  assert.equal(api.writes.length,0);
});
test("already active schema apply on same revision blocks dispatch", async () => {
  const api=harness({activeRuns:[{id:789,head_sha:input.expectedSha,status:"in_progress"}]});
  await assert.rejects(dispatchSchemaPlan(input,api),/SCHEMA_DISPATCH_EXISTING_ACTIVE_APPLY:789/);
  assert.equal(api.writes.length,0);
});
test("missing active-run inventory fails closed", async () => {
  const api=harness();
  const original=api.request;
  api.request=async(path,...rest)=>path.includes("/workflows/aurion-production-schema-apply.yml/runs?")?{}:original(path,...rest);
  await assert.rejects(dispatchSchemaPlan(input,api),/SCHEMA_DISPATCH_ACTIVE_RUNS_UNAVAILABLE/);
  assert.equal(api.writes.length,0);
});

// The GitHub workflow-dispatch endpoint returns 204/empty without opt-in;
// a missing run ID must stop the parent instead of dispatching another child.
test("missing dispatched run details fail closed without a second write", async () => {
  const api=harness(); const request=api.request;
  api.request=async(path,method,body)=>method==="POST"?(api.writes.push({path,body}),{}):request(path,method,body);
  await assert.rejects(dispatchSchemaPlan(input,api),/SCHEMA_DISPATCH_RUN_ID_MISSING/);
  assert.equal(api.writes.length,1);
});
