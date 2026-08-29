import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-production-apply");
const bin = path.join(out, "bin");
const drizzle = path.join(out, "drizzle");
const meta = path.join(drizzle, "meta");
const deploy = path.join(out, "deploy");
const revision = process.env.AURION_RELEASE_SHA?.trim() ?? "";
const tags = [
  "0021_aurion_global_world_state",
  "0022_aurion_world_chunk_deltas",
  "0023_aurion_world_presence_epochs",
  "0024_aurion_world_epoch_reactions",
  "0025_aurion_loot_mastery_ethos",
  "0026_aurion_faction_questline_state",
  "0027_aurion_faction_questline_rewards",
];
const deployFiles = [
  "aurion-production-schema-apply",
  "aurion-production-schema-apply-core",
  "aurion-production-schema-apply.environment.template",
  "aurion-production-schema-apply.sudoers",
  "aurion-reconcile-runtime-image.conf",
  "aurion-reconcile-runtime-network.conf",
  "install-aurion-production-schema-apply",
  "verify-aurion-production-schema-apply-artifact.mjs",
];

if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error("AURION_RELEASE_SHA must be the exact 40-character source revision");
}

const sha256 = async filePath => createHash("sha256").update(await readFile(filePath)).digest("hex");

await rm(out, { recursive: true, force: true });
await mkdir(bin, { recursive: true });
await mkdir(meta, { recursive: true });
await mkdir(deploy, { recursive: true });

for (const [source, target] of [
  ["reconcile-aurion-production-schema.ts", "reconcile.cjs"],
  ["apply-aurion-production-schema.ts", "apply.cjs"],
  ["aurionProductionDatabaseClientConfig.ts", "mysql-client-config.cjs"],
]) {
  await execFileAsync(path.join(root, "node_modules", ".bin", "esbuild"), [
    path.join(root, "scripts", source),
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=cjs",
    `--outfile=${path.join(bin, target)}`,
  ]);
}

const fullJournal = JSON.parse(await readFile(path.join(root, "drizzle", "meta", "_journal.json"), "utf8"));
if (fullJournal?.version !== "7" || fullJournal.dialect !== "mysql" || !Array.isArray(fullJournal.entries)) {
  throw new Error("Drizzle journal is not a supported MySQL journal");
}
const entries = fullJournal.entries.filter(entry => tags.includes(entry?.tag));
if (entries.length !== tags.length || entries.some((entry, index) => entry.tag !== tags[index] || !Number.isSafeInteger(entry.when) || (index > 0 && entry.when <= entries[index - 1].when))) {
  throw new Error("Late Aurion Drizzle journal entries are incomplete or out of order");
}
await writeFile(path.join(meta, "_journal.json"), `${JSON.stringify({ version: "7", dialect: "mysql", entries }, null, 2)}\n`, { mode: 0o644 });

for (const tag of tags) {
  await copyFile(path.join(root, "drizzle", `${tag}.sql`), path.join(drizzle, `${tag}.sql`));
}
for (const filename of deployFiles) {
  await copyFile(path.join(root, "deploy", filename), path.join(deploy, filename));
}

const relativeFiles = [
  "bin/apply.cjs",
  "bin/mysql-client-config.cjs",
  "bin/reconcile.cjs",
  "drizzle/meta/_journal.json",
  ...tags.map(tag => `drizzle/${tag}.sql`),
  ...deployFiles.map(filename => `deploy/${filename}`),
].sort();
const files = {};
for (const relative of relativeFiles) {
  const absolute = path.join(out, relative);
  const content = await readFile(absolute);
  files[relative] = { bytes: content.length, sha256: await sha256(absolute) };
}

const manifest = {
  schemaVersion: 1,
  recordType: "aurion_production_schema_apply_artifact",
  revision,
  nodeTarget: "node22",
  moduleFormat: "commonjs",
  mode: "backup_recovery_apply",
  migrationTags: tags,
  files,
};
await writeFile(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });

const checksumLines = [];
for (const relative of ["manifest.json", ...relativeFiles]) {
  checksumLines.push(`${await sha256(path.join(out, relative))}  ${relative}`);
}
await writeFile(path.join(out, "checksums.sha256"), `${checksumLines.join("\n")}\n`, { mode: 0o644 });

console.log(JSON.stringify({ revision, artifact: "dist-production-apply", files: Object.keys(files).length }));
