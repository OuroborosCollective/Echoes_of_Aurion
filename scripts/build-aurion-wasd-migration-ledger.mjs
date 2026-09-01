import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AURION_WASD_LEDGER_SCHEMA = "aurion.wasd-migration-ledger.v1";
export const SOURCE_LEDGER_SCHEMA = "wasd.aurion-source-ledger.v1";
export const MIGRATION_WAVE_MANIFEST_SCHEMA = "aurion.migration-wave-manifest.v2";
export const MIGRATION_WAVE_MANIFEST_PATH = "config/aurion-migration-wave-manifest.json";
export const FULL_SHA = /^[a-f0-9]{40}$/;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalSha256(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function revisionAt(root) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim().toLowerCase();
  if (!FULL_SHA.test(revision)) throw new Error("REVISION_INVALID");
  return revision;
}

function pathInside(root, candidate, errorCode) {
  const resolved = resolve(candidate);
  const relation = relative(root, resolved);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) throw new Error(errorCode);
  return resolved;
}

function safeRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !isAbsolute(value)
    && !value.split(/[\\/]/u).includes("..");
}

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
  if (!value) throw new Error(`${name.toUpperCase().replaceAll("-", "_").slice(2)}_REQUIRED`);
  return value;
}

function optionalArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : fallback;
}

async function verifyWasdSourceLedger(wasdRoot, sourceLedgerPath) {
  const sourceText = await readFile(sourceLedgerPath, "utf8");
  const sourceLedger = JSON.parse(sourceText);
  if (sourceLedger?.schemaVersion !== SOURCE_LEDGER_SCHEMA || sourceLedger?.recordType !== "wasd_aurion_source_ledger") {
    throw new Error("WASD_SOURCE_LEDGER_SCHEMA_INVALID");
  }
  const unsignedSourceLedger = { ...sourceLedger };
  delete unsignedSourceLedger.manifestSha256;
  if (!/^[a-f0-9]{64}$/.test(sourceLedger.manifestSha256 ?? "") || canonicalSha256(unsignedSourceLedger) !== sourceLedger.manifestSha256) {
    throw new Error("WASD_SOURCE_LEDGER_HASH_INVALID");
  }
  if (sourceLedger.source?.repository !== "OuroborosCollective/Wasd" || !FULL_SHA.test(sourceLedger.source?.revision ?? "")) {
    throw new Error("WASD_SOURCE_IDENTITY_INVALID");
  }
  const sourceRevision = revisionAt(wasdRoot);
  const expectedSourceRevision = process.env.WASD_SOURCE_SHA?.trim().toLowerCase();
  if (sourceRevision !== sourceLedger.source.revision || (expectedSourceRevision && expectedSourceRevision !== sourceRevision)) {
    throw new Error("WASD_SOURCE_REVISION_MISMATCH");
  }
  if (sourceLedger.policy?.databaseConnectionsOpened !== false
    || sourceLedger.policy?.sourceCodeCopiedIntoAurion !== false
    || sourceLedger.policy?.prohibitedActions?.includes("database_write") !== true) {
    throw new Error("WASD_SOURCE_LEDGER_POLICY_INVALID");
  }
  if (!Array.isArray(sourceLedger.files) || sourceLedger.files.length === 0) throw new Error("WASD_SOURCE_LEDGER_EMPTY");

  const seenPaths = new Set();
  const domainCounts = new Map();
  for (const file of sourceLedger.files) {
    if (!safeRelativePath(file?.path) || !/^[a-f0-9]{64}$/.test(file?.sha256 ?? "") || typeof file?.domain !== "string") {
      throw new Error("WASD_SOURCE_LEDGER_FILE_INVALID");
    }
    if (seenPaths.has(file.path)) throw new Error("WASD_SOURCE_LEDGER_PATH_DUPLICATE");
    seenPaths.add(file.path);
    const sourcePath = pathInside(wasdRoot, resolve(wasdRoot, file.path), "WASD_SOURCE_PATH_OUTSIDE_REPOSITORY");
    const content = await readFile(sourcePath);
    if (sha256(content) !== file.sha256) throw new Error(`WASD_SOURCE_FILE_HASH_MISMATCH:${file.path}`);
    domainCounts.set(file.domain, (domainCounts.get(file.domain) ?? 0) + 1);
  }

  return {
    manifestSha256: sourceLedger.manifestSha256,
    repository: sourceLedger.source.repository,
    revision: sourceRevision,
    sourceFileCount: sourceLedger.files.length,
    domainCounts: Object.fromEntries(Array.from(domainCounts).sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function loadMigrationWaveManifest(root) {
  const manifestPath = join(root, MIGRATION_WAVE_MANIFEST_PATH);
  const source = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(source);
  const migrations = manifest?.migrations;
  if (manifest?.schemaVersion !== MIGRATION_WAVE_MANIFEST_SCHEMA || typeof manifest?.waveId !== "string" || !Array.isArray(migrations) || migrations.length === 0) {
    throw new Error("AURION_MIGRATION_WAVE_MANIFEST_INVALID");
  }
  const tags = migrations.map(migration => migration?.tag);
  if (tags.some(tag => typeof tag !== "string" || !/^\d{4}_[a-z0-9_]+$/u.test(tag))) throw new Error("AURION_MIGRATION_WAVE_TAG_INVALID");
  if (new Set(tags).size !== tags.length) throw new Error("AURION_MIGRATION_WAVE_TAG_DUPLICATE");
  if (tags.some((tag, index) => index > 0 && tag <= tags[index - 1])) throw new Error("AURION_MIGRATION_WAVE_TAG_ORDER_INVALID");
  if (manifest.policy?.productionWritesScheduled !== false || manifest.policy?.ownerApprovalRequired !== true) throw new Error("AURION_MIGRATION_WAVE_POLICY_INVALID");
  return { ...manifest, migrations };
}

async function targetMigrationInventory(root, manifest) {
  const journalPath = join(root, "drizzle", "meta", "_journal.json");
  const journalSource = await readFile(journalPath, "utf8");
  const journal = JSON.parse(journalSource);
  if (journal?.dialect !== "mysql" || !Array.isArray(journal.entries)) throw new Error("AURION_MIGRATION_JOURNAL_INVALID");
  const journalTags = new Set(journal.entries.map(entry => entry?.tag).filter(tag => typeof tag === "string"));
  const migrations = [];
  for (const { tag } of manifest.migrations) {
    const path = `drizzle/${tag}.sql`;
    let source;
    try {
      source = await readFile(join(root, path));
    } catch {
      throw new Error(`AURION_MIGRATION_FILE_MISSING:${tag}`);
    }
    if (!journalTags.has(tag)) throw new Error(`AURION_MIGRATION_UNJOURNALED_TAG:${tag}`);
    migrations.push({ tag, path, sha256: sha256(source), journalPresent: true });
  }
  return {
    dialect: journal.dialect,
    journalSha256: sha256(Buffer.from(journalSource, "utf8")),
    journalEntryCount: journal.entries.length,
    migrations,
  };
}

/**
 * Creates a two-repository migration plan and receipt. The script deliberately
 * has no database client, no network client, and no code path that can apply a
 * schema, backfill, journal repair, or deployment action.
 */
export async function buildAurionWasdMigrationLedger({
  root = process.cwd(),
  wasdRoot,
  sourceLedgerPath,
  out = "dist/aurion-wasd-migration-ledger",
} = {}) {
  if (!wasdRoot) throw new Error("WASD_ROOT_REQUIRED");
  if (!sourceLedgerPath) throw new Error("SOURCE_LEDGER_REQUIRED");
  const aurionRoot = resolve(root);
  const sourceRoot = resolve(wasdRoot);
  const resolvedSourceLedger = pathInside(sourceRoot, resolve(sourceLedgerPath), "WASD_SOURCE_LEDGER_OUTSIDE_REPOSITORY");
  const outputDirectory = pathInside(aurionRoot, resolve(aurionRoot, out), "OUTPUT_PATH_OUTSIDE_AURION_REPOSITORY");
  const aurionRevision = revisionAt(aurionRoot);
  const waveManifest = await loadMigrationWaveManifest(aurionRoot);
  const wasd = await verifyWasdSourceLedger(sourceRoot, resolvedSourceLedger);
  const target = await targetMigrationInventory(aurionRoot, waveManifest);
  const repositoryState = "PENDING_PRODUCTION_READBACK";

  const unsignedLedger = {
    schemaVersion: AURION_WASD_LEDGER_SCHEMA,
    recordType: "aurion_wasd_migration_ledger",
    source: wasd,
    target: {
      repository: "OuroborosCollective/Echoes_of_Aurion",
      revision: aurionRevision,
      migrationJournal: target,
    },
    repositoryState,
    plan: {
      automaticPhases: ["verify_source", "inventory_target", "emit_plan", "emit_receipt"],
      waveId: waveManifest.waveId,
      requiredProductionReadback: waveManifest.migrations.map(migration => migration.tag),
      ownerApprovalRequiredFor: ["schema_apply", "data_backfill", "journal_repair", "production_deploy"],
      prohibitedActions: ["database_write", "schema_apply", "data_backfill", "journal_repair", "production_deploy"],
      productionWritesScheduled: false,
      sourceCodeCopiedIntoAurion: false,
      acceptanceRule: "A production change requires a fresh root-authorized readback, backup/recovery evidence, and an owner-approved plan hash.",
    },
  };
  const ledger = { ...unsignedLedger, planSha256: canonicalSha256(unsignedLedger) };
  const payload = `${JSON.stringify(ledger, null, 2)}\n`;
  const payloadSha256 = sha256(Buffer.from(payload, "utf8"));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "migration-ledger.json"), payload, { encoding: "utf8", mode: 0o644 });
  await writeFile(join(outputDirectory, "checksums.sha256"), `${payloadSha256}  migration-ledger.json\n`, { encoding: "utf8", mode: 0o644 });

  return {
    aurionRevision,
    wasdRevision: wasd.revision,
    planSha256: ledger.planSha256,
    repositoryState,
    outputDirectory,
  };
}

async function main() {
  const result = await buildAurionWasdMigrationLedger({
    wasdRoot: requiredArgument("--wasd-root"),
    sourceLedgerPath: requiredArgument("--source-ledger"),
    out: optionalArgument("--out", "dist/aurion-wasd-migration-ledger"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
