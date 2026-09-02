import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const MANIFEST_SCHEMA = "aurion.migration-wave-manifest.v3";
export const SHA40 = /^[a-f0-9]{40}$/u;
export const SHA64 = /^[a-f0-9]{64}$/u;

const canonicalValue = value =>
  Array.isArray(value)
    ? value.map(canonicalValue)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, canonicalValue(value[key])])
        )
      : value;

export const canonicalSha256 = value =>
  createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)), "utf8")
    .digest("hex");

const revisionAt = root =>
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .trim()
    .toLowerCase();

export function verifyManifest(
  manifest,
  { expectedSourceRevision, expectedTargetRevision } = {}
) {
  if (
    manifest?.schemaVersion !== MANIFEST_SCHEMA ||
    manifest?.recordType !== "aurion_migration_wave_manifest"
  ) {
    throw new Error("WAVE_MANIFEST_SCHEMA_INVALID");
  }
  if (manifest.status !== "planned")
    throw new Error("WAVE_MANIFEST_STATUS_INVALID");
  if (
    manifest.source?.repository !== "OuroborosCollective/Wasd" ||
    !SHA40.test(manifest.source?.revision ?? "")
  ) {
    throw new Error("WAVE_MANIFEST_SOURCE_INVALID");
  }
  if (
    manifest.target?.repository !== "OuroborosCollective/Echoes_of_Aurion" ||
    !SHA40.test(manifest.target?.revision ?? "")
  ) {
    throw new Error("WAVE_MANIFEST_TARGET_INVALID");
  }
  if (
    expectedSourceRevision &&
    manifest.source.revision !== expectedSourceRevision.toLowerCase()
  )
    throw new Error("WAVE_MANIFEST_SOURCE_REVISION_MISMATCH");
  if (
    expectedTargetRevision &&
    manifest.target.revision !== expectedTargetRevision.toLowerCase()
  )
    throw new Error("WAVE_MANIFEST_TARGET_REVISION_MISMATCH");
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0)
    throw new Error("WAVE_MANIFEST_EMPTY");
  const sequences = manifest.migrations.map(migration => migration?.sequence);
  if (
    sequences.some(sequence => !Number.isInteger(sequence) || sequence < 1) ||
    sequences.some((sequence, index) => sequence !== sequences[0] + index)
  ) {
    throw new Error("WAVE_MANIFEST_SEQUENCE_INVALID");
  }
  const paths = new Set();
  const tags = new Set();
  for (const migration of manifest.migrations) {
    if (
      !/^\d{4}_[a-z0-9_]+$/u.test(migration?.tag ?? "") ||
      !/^drizzle\/\d{4}_[a-z0-9_]+\.sql$/u.test(migration?.path ?? "")
    )
      throw new Error("WAVE_MANIFEST_MIGRATION_ID_INVALID");
    if (tags.has(migration.tag) || paths.has(migration.path))
      throw new Error("WAVE_MANIFEST_DUPLICATE_MIGRATION");
    tags.add(migration.tag);
    paths.add(migration.path);
    if (migration.status !== "planned" || migration.fileSha256 !== null)
      throw new Error("WAVE_MANIFEST_PLANNED_ENTRY_INVALID");
  }
  if (
    manifest.policy?.productionWritesScheduled !== false ||
    manifest.policy?.ownerApprovalRequired !== true ||
    manifest.policy?.requiresFreshPlanHashBeforeApply !== true
  ) {
    throw new Error("WAVE_MANIFEST_POLICY_INVALID");
  }
  const unsigned = { ...manifest };
  delete unsigned.manifestSha256;
  if (
    !SHA64.test(manifest.manifestSha256 ?? "") ||
    canonicalSha256(unsigned) !== manifest.manifestSha256
  )
    throw new Error("WAVE_MANIFEST_HASH_INVALID");
  return {
    waveId: manifest.waveId,
    migrationCount: manifest.migrations.length,
    firstSequence: sequences[0],
    lastSequence: sequences.at(-1),
    manifestSha256: manifest.manifestSha256,
  };
}

export async function verifyManifestFile(path, options = {}) {
  const manifest = JSON.parse(await readFile(resolve(path), "utf8"));
  return verifyManifest(manifest, options);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  const [manifestPath, expectedSourceRevision, expectedTargetRevision] =
    process.argv.slice(2);
  if (!manifestPath) throw new Error("MANIFEST_PATH_REQUIRED");
  verifyManifestFile(manifestPath, {
    expectedSourceRevision,
    expectedTargetRevision,
  })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 2;
    });
}
