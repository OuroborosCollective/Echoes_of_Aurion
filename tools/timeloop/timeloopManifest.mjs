import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const AURION_TIMELOOP_MANIFEST_VERSION = "aurion.timeloop-workload.v1";
export const AURION_TIMELOOP_UPSTREAM = Object.freeze({ repository: "https://github.com/NVlabs/timeloop", commit: "32370826fdf1aa3c8deb0c93e6b2a2fc7cf053aa" });

const SHA1_RE = /^[a-f0-9]{40}$/;
const FORBIDDEN_KEYS = new Set(["timestamp","createdAt","updatedAt","wallClock","now","random","randomSeed","pid","processId","threadId","performanceMs"]);

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, sortValue(v)]));
  return value;
}

export function canonicalJson(value) { return JSON.stringify(sortValue(value)); }
export function sha256(value) { return "sha256:" + createHash("sha256").update(value).digest("hex"); }

function assertNoForbiddenFields(value, path = "$") {
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoForbiddenFields(item, path + "[" + index + "]")); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("TIMELOOP_MANIFEST_NON_DETERMINISTIC_FIELD:" + path + "." + key);
    assertNoForbiddenFields(child, path + "." + key);
  }
}

function assertIdentifier(value, field) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("TIMELOOP_MANIFEST_INVALID_" + field.toUpperCase());
}

export function normalizeTimeloopManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("TIMELOOP_MANIFEST_INVALID_ROOT");
  assertNoForbiddenFields(input);
  if (input.schemaVersion !== AURION_TIMELOOP_MANIFEST_VERSION) throw new Error("TIMELOOP_MANIFEST_SCHEMA_VERSION_UNSUPPORTED");
  if (input.authority !== "NON_AUTHORITATIVE_OFFLINE_ANALYSIS") throw new Error("TIMELOOP_MANIFEST_AUTHORITY_INVALID");
  if (input.analysisStatus !== "PROSPECTIVE_PROXY") throw new Error("TIMELOOP_MANIFEST_ANALYSIS_STATUS_INVALID");
  assertIdentifier(input.workloadId, "workload_id"); assertIdentifier(input.scenarioId, "scenario_id");
  if (!SHA1_RE.test(input.sourceRevision)) throw new Error("TIMELOOP_MANIFEST_SOURCE_REVISION_INVALID");
  if (!input.sourceEvidence || typeof input.sourceEvidence !== "object") throw new Error("TIMELOOP_MANIFEST_SOURCE_EVIDENCE_REQUIRED");
  assertIdentifier(input.sourceEvidence.path, "source_path");
  if (!SHA1_RE.test(input.sourceEvidence.blobSha)) throw new Error("TIMELOOP_MANIFEST_SOURCE_BLOB_SHA_INVALID");
  if (input.sourceEvidence.kind !== "STATIC_REPOSITORY_PROVENANCE") throw new Error("TIMELOOP_MANIFEST_SOURCE_EVIDENCE_KIND_INVALID");
  if (input.timeloop?.repository !== AURION_TIMELOOP_UPSTREAM.repository) throw new Error("TIMELOOP_MANIFEST_UPSTREAM_REPOSITORY_INVALID");
  if (!SHA1_RE.test(input.timeloop?.commit || "")) throw new Error("TIMELOOP_MANIFEST_UPSTREAM_COMMIT_INVALID");
  if (input.timeloop.commit !== AURION_TIMELOOP_UPSTREAM.commit) throw new Error("TIMELOOP_MANIFEST_UPSTREAM_COMMIT_NOT_PINNED");
  if (input.kernel?.class !== "VECTOR_ELEMENTWISE_PROXY") throw new Error("TIMELOOP_MANIFEST_KERNEL_CLASS_INVALID");
  if (!Number.isSafeInteger(input.kernel?.entityCount) || input.kernel.entityCount < 1 || input.kernel.entityCount > 1000000) throw new Error("TIMELOOP_MANIFEST_ENTITY_BOUND_INVALID");
  if (input.kernel.sourceMapping !== "RenderEcsPilot.benchmark") throw new Error("TIMELOOP_MANIFEST_SOURCE_MAPPING_INVALID");
  if (input.kernel.authoritativeEquivalent !== false) throw new Error("TIMELOOP_MANIFEST_AUTHORITY_EQUIVALENCE_MUST_BE_FALSE");
  const normalized = sortValue(structuredClone(input)); delete normalized.manifestHash;
  const manifestHash = sha256(canonicalJson(normalized));
  if (input.manifestHash !== undefined && input.manifestHash !== manifestHash) throw new Error("TIMELOOP_MANIFEST_HASH_MISMATCH");
  return Object.freeze({ ...normalized, manifestHash });
}

export async function readTimeloopManifest(path) { return normalizeTimeloopManifest(JSON.parse(await readFile(path, "utf8"))); }

if (import.meta.url === "file://" + process.argv[1]) {
  const path = process.argv[2];
  if (!path) { console.error("usage: node tools/timeloop/timeloopManifest.mjs <manifest.json>"); process.exitCode = 64; }
  else {
    try { const manifest = await readTimeloopManifest(path); console.log(JSON.stringify({ status: "VALIDATED_OFFLINE_MANIFEST", manifestHash: manifest.manifestHash, sourceRevision: manifest.sourceRevision, sourceEvidence: manifest.sourceEvidence, timeloop: manifest.timeloop }, null, 2)); }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  }
}
