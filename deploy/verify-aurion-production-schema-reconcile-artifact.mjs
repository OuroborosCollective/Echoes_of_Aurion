#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const tags = [
  "0021_aurion_global_world_state",
  "0022_aurion_world_chunk_deltas",
  "0023_aurion_world_presence_epochs",
  "0024_aurion_world_epoch_reactions",
  "0025_aurion_loot_mastery_ethos",
  "0026_aurion_faction_questline_state",
  "0027_aurion_faction_questline_rewards",
  "0028_aurion_world_checkpoint", "0029_aurion_guild_kingdom_authority", "0030_aurion_guild_bank_economy", "0031_aurion_profession_crafting_persistence",
];
const contractTags = [...tags, "0001_shocking_doctor_octopus", "0009_rainy_multiple_man", "0019_wasd_aurion_crafting_receipt_inventory"];

const requiredFiles = [
  "bin/reconcile.cjs",
  ...contractTags.map(tag => `drizzle/${tag}.sql`),
  "deploy/aurion-production-schema-reconcile",
  "deploy/aurion-production-schema-reconcile.sudoers",
  "deploy/install-aurion-production-schema-reconcile",
  "deploy/aurion-reconcile-runtime-image.conf",
  "deploy/aurion-reconcile-runtime-network.conf",
  "deploy/verify-aurion-production-schema-reconcile-artifact.mjs",
].sort();

function fail() {
  process.stderr.write("reconciliation artifact integrity contract failed\n");
  process.exit(70);
}

function sameEntries(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function safeRelative(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && !value.split("/").includes("..");
}

async function listedFiles(root, prefix = "") {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) fail();
    if (entry.isDirectory()) {
      files.push(...await listedFiles(root, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      fail();
    }
  }
  return files;
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function main() {
  if (process.argv.length !== 4) fail();
  const [artifactArg, expectedRevision] = process.argv.slice(2);
  if (!artifactArg || !/^[a-f0-9]{40}$/.test(expectedRevision ?? "")) fail();
  const artifact = path.resolve(artifactArg);
  const rootStat = await lstat(artifact).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) fail();

  const manifestPath = path.join(artifact, "manifest.json");
  const checksumsPath = path.join(artifact, "checksums.sha256");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest?.schemaVersion !== 1
    || manifest.recordType !== "aurion_production_schema_reconcile_artifact"
    || manifest.revision !== expectedRevision
    || manifest.nodeTarget !== "node22"
    || manifest.mode !== "read_only"
    || manifest.moduleFormat !== "commonjs"
    || !manifest.files
    || typeof manifest.files !== "object"
    || Array.isArray(manifest.files)
  ) fail();

  const manifestKeys = Object.keys(manifest).sort();
  if (!sameEntries(manifestKeys, ["files", "mode", "moduleFormat", "nodeTarget", "recordType", "revision", "schemaVersion"])) fail();

  const manifestFiles = Object.keys(manifest.files).sort();
  if (!sameEntries(manifestFiles, requiredFiles) || manifestFiles.some(file => !safeRelative(file))) fail();

  const checksumEntries = new Map();
  const checksumSource = await readFile(checksumsPath, "utf8");
  if (!checksumSource.endsWith("\n")) fail();
  const checksumLines = checksumSource.slice(0, -1).split("\n");
  if (checksumLines.length === 0 || checksumLines.some(line => line.length === 0)) fail();
  for (const line of checksumLines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match || !safeRelative(match[2]) || checksumEntries.has(match[2])) fail();
    checksumEntries.set(match[2], match[1]);
  }
  const expectedChecksums = ["manifest.json", ...requiredFiles].sort();
  if (!sameEntries([...checksumEntries.keys()].sort(), expectedChecksums)) fail();

  const actualFiles = (await listedFiles(artifact)).sort();
  if (!sameEntries(actualFiles, ["checksums.sha256", "manifest.json", ...requiredFiles].sort())) fail();

  for (const relative of requiredFiles) {
    const metadata = manifest.files[relative];
    if (
      !metadata
      || !sameEntries(Object.keys(metadata).sort(), ["bytes", "sha256"])
      || !Number.isSafeInteger(metadata.bytes)
      || metadata.bytes < 0
      || !/^[a-f0-9]{64}$/.test(metadata.sha256)
    ) fail();
    const filePath = path.join(artifact, relative);
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== metadata.bytes) fail();
    const digest = await sha256(filePath);
    if (digest !== metadata.sha256 || digest !== checksumEntries.get(relative)) fail();
  }
  if (await sha256(manifestPath) !== checksumEntries.get("manifest.json")) fail();

  const imageContract = JSON.parse(await readFile(path.join(artifact, "deploy/aurion-reconcile-runtime-image.conf"), "utf8"));
  if (
    imageContract?.schemaVersion !== 1
    || imageContract.recordType !== "aurion_reconcile_runtime_image_contract"
    || imageContract.nodeMajorVersion !== 22
    || typeof imageContract.imageTag !== "string"
    || !/^node:22[A-Za-z0-9._:-]*$/.test(imageContract.imageTag)
    || typeof imageContract.imageDigest !== "string"
    || !/^sha256:[a-f0-9]{64}$/.test(imageContract.imageDigest)
  ) fail();

  const networkContract = JSON.parse(await readFile(path.join(artifact, "deploy/aurion-reconcile-runtime-network.conf"), "utf8"));
  if (
    networkContract?.schemaVersion !== 1
    || networkContract.recordType !== "aurion_reconcile_runtime_network_contract"
    || networkContract.network !== "echoes-of-aurion-internal"
  ) fail();
}

main().catch(() => fail());
