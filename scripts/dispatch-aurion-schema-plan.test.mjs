import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dispatchSchemaPlan } from "./dispatch-aurion-schema-plan.mjs";

const input = { manifest: JSON.parse(await readFile(new URL("../config/aurion-migration-wave-manifest.json", import.meta.url), "utf8")), expectedSha: "a".repeat(40), planSha256: "b".repeat(64), ledgerRunId: "123" };
function harness(overrides = {}) {
  const writes = [];
  return { writes, pause: async () => {}, attempts: 2, request: async (path, method, body) => {
    if (method === "POST") { writes.push({ path, body }); return { workflow_run_id: 456 }; }
    if (path.endsWith("/123")) return { head_sha: input.expectedSha, head_branch: "main", event: "push", path: ".github/workflows/deploy-aurion-zone-runtime.yml", ...overrides.caller };
    if (path.endsWith("/heads/main")) return { object: { sha: overrides.main ?? input.expectedSha } };
    return { head_sha: input.expectedSha, event: "workflow_dispatch", path: ".github/workflows/aurion-production-schema-apply.yml", status: "completed", conclusion: "success", ...overrides.run };
  } };
}

test("dispatches exactly one revision/plan-bound apply and waits for that run", async () => {
  const api = harness();
  assert.equal((await dispatchSchemaPlan(input, api)).applyRunId, 456);
  assert.equal(api.writes.length, 1);
  assert.deepEqual(api.writes[0].body, { ref: "main", inputs: { ledger_run_id: "123", plan_sha256: input.planSha256 } });
});
test("future waves, PR callers and stale main fail before any dispatch", async () => {
  for (const [value, options] of [[{ ...input, manifest: { ...input.manifest, waveId: "future" } }, {}], [input, { caller: { event: "pull_request" } }], [input, { main: "c".repeat(40) }]]) {
    const api = harness(options);
    await assert.rejects(dispatchSchemaPlan(value, api));
    assert.equal(api.writes.length, 0);
  }
});
test("failed, mismatched and unfinished apply runs never count as successful", async () => {
  for (const run of [{ conclusion: "failure" }, { head_sha: "c".repeat(40) }, { status: "in_progress" }]) {
    const api = harness({ run });
    await assert.rejects(dispatchSchemaPlan(input, api));
    assert.equal(api.writes.length, 1);
  }
});
