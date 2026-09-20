import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalSha256 } from "./aurion-build-input-manifest.mjs";

export const ASSURANCE_SCHEMA = "aurion.causal-assurance.v1";
export const PRODUCTION_RECEIPT_SCHEMA = "aurion.production-causal-assurance.v1";
export const assuranceKeys = [
  "RUNTIME_REVISION", "BUILD_INPUT", "ARTIFACT", "RUNTIME_IMAGE", "ATTESTATION", "SCHEMA",
  "RECEIPT_CHAIN", "WORLD_ROOT", "REPLAY_SAMPLE", "EFFECT_JOURNAL", "CROSS_ZONE", "PROJECTION",
];
const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const SUMMARY = /^[A-Z0-9_:-]{3,160}$/;
const STATUSES = new Set(["MATCH", "DEGRADED", "UNVERIFIED", "CONTRADICTED"]);

function statusFor(observations) {
  if (observations.some(value => value.status === "CONTRADICTED")) return "CONTRADICTED";
  if (observations.some(value => value.status === "UNVERIFIED")) return "UNVERIFIED";
  if (observations.some(value => value.status === "DEGRADED")) return "DEGRADED";
  return "HEALTHY";
}

function recoveryPlan(status, observations) {
  const actions = [];
  if (observations.some(value => value.status === "UNVERIFIED")) actions.push("COLLECT_MISSING_EVIDENCE");
  if (observations.some(value => value.status === "DEGRADED")) actions.push("REPLAY_READ_ONLY_SAMPLE");
  if (observations.some(value => value.status === "CONTRADICTED")) actions.push("PRESERVE_CONTRADICTED_EVIDENCE", "PAUSE_PROMOTION");
  if (status !== "HEALTHY") actions.push("REQUEST_OPERATOR_REVIEW");
  return { protocol: "aurion.assurance-recovery-plan.v1", triggerStatus: status === "HEALTHY" ? null : status,
    preserveEvidenceHashes: observations.flatMap(value => value.evidenceHash ? [value.evidenceHash] : []),
    actions, destructiveActions: [], requiresHumanApproval: true, mutationAuthority: "none" };
}

function sealSnapshot({ worldId, sequence, observedAtMs, observations }) {
  if (worldId !== "echoes-of-aurion-global" || !Number.isSafeInteger(sequence) || sequence < 1 ||
      !Number.isSafeInteger(observedAtMs) || observedAtMs < 0 || observations.length !== assuranceKeys.length) throw Error("ASSURANCE_IDENTITY_INVALID");
  const byKey = new Map(observations.map(value => [value.key, value]));
  if (byKey.size !== assuranceKeys.length || assuranceKeys.some(key => !byKey.has(key))) throw Error("ASSURANCE_OBSERVATION_SET_INVALID");
  const ordered = assuranceKeys.map(key => {
    const value = byKey.get(key);
    if (!STATUSES.has(value?.status) || !SUMMARY.test(value?.summary ?? "") ||
        (value.evidenceHash !== null && !HASH.test(value.evidenceHash ?? "")) ||
        !Number.isSafeInteger(value.sampleCount) || value.sampleCount < 0) throw Error(`ASSURANCE_OBSERVATION_INVALID:${key}`);
    return { key, status: value.status, summary: value.summary, evidenceHash: value.evidenceHash, sampleCount: value.sampleCount };
  });
  const status = statusFor(ordered), plan = recoveryPlan(status, ordered);
  const unsigned = { schema: ASSURANCE_SCHEMA, worldId, sequence, observedAtMs, status,
    observations: ordered, recoveryPlan: plan, mutationAuthority: "none" };
  return { ...unsigned, snapshotHash: canonicalSha256(unsigned) };
}

function verifySnapshot(value) {
  try {
    const rebuilt = sealSnapshot(value);
    return rebuilt.snapshotHash === value.snapshotHash && canonicalSha256(rebuilt) === canonicalSha256(value);
  } catch { return false; }
}

function requireIdentity({ health, identity, attestation, schema, expectedRevision }) {
  if (!REVISION.test(expectedRevision) || health?.revision !== expectedRevision ||
      identity?.sourceRevision !== expectedRevision || identity?.mergeSha !== expectedRevision ||
      attestation?.gateId !== "AURION-M21-B2-ATTESTATION" || attestation?.sourceRevision !== expectedRevision ||
      attestation?.status !== "PASS" || !Array.isArray(attestation?.checks) || attestation.checks.some(check => check?.pass !== true) ||
      schema?.sourceRevision !== expectedRevision || schema?.state !== "PRESENT_SCHEMA_MATCH" || schema?.readOnly !== true ||
      schema?.databaseCredentialReturned !== false || !Array.isArray(schema?.migrations) ||
      schema?.summary?.migrationCount !== schema.migrations.length || schema?.summary?.matchCount !== schema.migrations.length ||
      schema?.summary?.absentCount !== 0 || schema?.summary?.driftCount !== 0) throw Error("PRODUCTION_ASSURANCE_EXTERNAL_IDENTITY_INVALID");
  for (const key of ["buildInputDigest", "artifactDigest", "runtimeImageDigest", "releaseArchiveDigest"]) {
    if (!HASH.test(identity[key] ?? "") || health[key] !== identity[key]) throw Error(`PRODUCTION_ASSURANCE_${key.toUpperCase()}_MISMATCH`);
  }
}

export function buildProductionAssuranceReceipt({ health, identity, attestation, schema, expectedRevision }) {
  requireIdentity({ health, identity, attestation, schema, expectedRevision });
  const runtime = health?.causalAssurance;
  if (!verifySnapshot(runtime)) throw Error("PRODUCTION_ASSURANCE_RUNTIME_SNAPSHOT_INVALID");
  const byKey = new Map(runtime.observations.map(value => [value.key, value]));
  const expectedRuntimeEvidence = {
    RUNTIME_REVISION: canonicalSha256({ sourceRevision: expectedRevision }),
    BUILD_INPUT: canonicalSha256({ digest: identity.buildInputDigest }),
    ARTIFACT: canonicalSha256({ digest: identity.artifactDigest }),
    RUNTIME_IMAGE: canonicalSha256({ digest: identity.runtimeImageDigest }),
  };
  for (const [key, evidenceHash] of Object.entries(expectedRuntimeEvidence)) {
    const observation = byKey.get(key);
    if (observation?.status !== "MATCH" || observation.evidenceHash !== evidenceHash) throw Error(`PRODUCTION_ASSURANCE_${key}_INVALID`);
  }
  for (const key of ["ATTESTATION", "SCHEMA"]) {
    const observation = byKey.get(key);
    if (observation?.status !== "UNVERIFIED" || observation.evidenceHash !== null) throw Error(`PRODUCTION_ASSURANCE_RUNTIME_${key}_UPGRADED`);
  }
  byKey.set("ATTESTATION", { key: "ATTESTATION", status: "MATCH", summary: "ATTESTATION_GATE_VERIFIED",
    evidenceHash: canonicalSha256(attestation), sampleCount: attestation.checks.length });
  byKey.set("SCHEMA", { key: "SCHEMA", status: "MATCH", summary: "SCHEMA_READBACK_MATCH",
    evidenceHash: canonicalSha256(schema), sampleCount: schema.migrations.length });
  const snapshot = sealSnapshot({ worldId: runtime.worldId, sequence: runtime.sequence,
    observedAtMs: runtime.observedAtMs, observations: [...byKey.values()] });
  const unsigned = { schema: PRODUCTION_RECEIPT_SCHEMA, sourceRevision: expectedRevision,
    runtimeSnapshotHash: runtime.snapshotHash, attestationGateEvidenceHash: canonicalSha256(attestation),
    schemaReadbackEvidenceHash: canonicalSha256(schema), snapshot, mutationAuthority: "none" };
  return { ...unsigned, receiptHash: canonicalSha256(unsigned) };
}

function argument(name) {
  const index = process.argv.indexOf(name), value = index >= 0 ? process.argv[index + 1] : null;
  if (!value) throw Error(`${name.slice(2).toUpperCase().replaceAll("-", "_")}_REQUIRED`);
  return value;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const read = name => JSON.parse(fs.readFileSync(argument(name), "utf8"));
    const receipt = buildProductionAssuranceReceipt({ health: read("--health"), identity: read("--identity"),
      attestation: read("--attestation"), schema: read("--schema"), expectedRevision: argument("--expected-sha") });
    fs.writeFileSync(argument("--output"), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    process.stdout.write(JSON.stringify({ status: receipt.snapshot.status, sourceRevision: receipt.sourceRevision,
      receiptHash: receipt.receiptHash, mutationAuthority: "none" }) + "\n");
    if (receipt.snapshot.status === "CONTRADICTED") process.exitCode = 3;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "PRODUCTION_ASSURANCE_FAILED"}\n`);
    process.exitCode = 2;
  }
}
