import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGateEvidence, GATE_EVIDENCE_SCHEMA } from "./aurion-milestone-gate-evidence.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
function base(overrides = {}) {
  return {
    schemaVersion: GATE_EVIDENCE_SCHEMA,
    gateId: "AURION-M21-B8-EVIDENCE",
    scope: "repository",
    passCriteria: ["exact revision and reproducible command are bound"],
    failCriteria: ["missing evidence is a hard failure"],
    sourceRevision: sha,
    workflow: ".github/workflows/aurion-local-test-pack.yml",
    command: "node --test scripts/aurion-milestone-gate-evidence.test.mjs",
    testSources: ["scripts/aurion-milestone-gate-evidence.test.mjs"],
    externalId: "https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/1",
    reproducible: true,
    releaseIdentity: { sourceRevision: sha },
    expected: { contract: "PASS" },
    observed: { contract: "PASS" },
    checks: [{ name: "contract", expected: "PASS", observed: "PASS", pass: true }],
    status: "PASS",
    ...overrides,
  };
}

test("accepts a complete reproducible repository gate receipt", () => {
  assert.equal(evaluateGateEvidence(base()).status, "PASS");
});

test("missing or nonreproducible evidence cannot be PASS", () => {
  for (const candidate of [
    base({ testSources: [] }),
    base({ reproducible: false }),
    base({ externalId: "" }),
    base({ checks: [] }),
  ]) assert.equal(evaluateGateEvidence(candidate).status, "FAIL");
});

test("runtime PASS requires immutable build, artifact and image digests", () => {
  const valid = base({
    scope: "runtime",
    releaseIdentity: {
      sourceRevision: sha,
      buildInputDigest: digest,
      artifactDigest: digest,
      runtimeImageDigest: digest,
    },
  });
  assert.equal(evaluateGateEvidence(valid).status, "PASS");
  const missingImage = structuredClone(valid);
  delete missingImage.releaseIdentity.runtimeImageDigest;
  missingImage.status = "FAIL";
  assert.equal(evaluateGateEvidence(missingImage).status, "FAIL");
});

test("production PASS requires authenticated readback and exact merge identity", () => {
  const valid = base({
    scope: "production",
    mergeSha: sha,
    authenticatedReadback: true,
    releaseIdentity: {
      sourceRevision: sha,
      buildInputDigest: digest,
      artifactDigest: digest,
      runtimeImageDigest: digest,
    },
  });
  assert.equal(evaluateGateEvidence(valid).status, "PASS");
  assert.equal(evaluateGateEvidence({ ...valid, authenticatedReadback: false, status: "FAIL" }).status, "FAIL");
  assert.equal(evaluateGateEvidence({ ...valid, mergeSha: "c".repeat(40), status: "FAIL" }).status, "FAIL");
});

test("a failed check cannot be promoted to PASS", () => {
  const candidate = base({
    checks: [{ name: "revision", expected: sha, observed: "c".repeat(40), pass: false }],
  });
  assert.equal(evaluateGateEvidence(candidate).status, "FAIL");
});

test("secret-like values fail closed", () => {
  const candidate = base({ observed: { value: "github_pat_this_is_not_allowed_1234567890" }, status: "FAIL" });
  const result = evaluateGateEvidence(candidate);
  assert.equal(result.status, "FAIL");
  assert.ok(result.errors.some(error => error.startsWith("secret:")));
});
