import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-production-reconcile");
const bin = path.join(out, "bin");
const drizzle = path.join(out, "drizzle");
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
  "aurion-production-schema-reconcile",
  "aurion-production-schema-reconcile.sudoers",
  "install-aurion-production-schema-reconcile",
  "aurion-reconcile-runtime-image.conf",
];

if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error("AURION_RELEASE_SHA must be the exact 40-character source revision");
}

const sha256 = async filePath => createHash("sha256").update(await readFile(filePath)).digest("hex");

await rm(out, { recursive: true, force: true });
await mkdir(bin, { recursive: true });
await mkdir(drizzle, { recursive: true });
await mkdir(deploy, { recursive: true });

await execFileAsync(path.join(root, "node_modules", ".bin", "esbuild"), [
  path.join(root, "scripts", "reconcile-aurion-production-schema.ts"),
  "--bundle",
  "--platform=node",
  "--target=node22",
  "--format=cjs",
  `--outfile=${path.join(bin, "reconcile.cjs")}`,
]);

for (const tag of tags) {
  await copyFile(path.join(root, "drizzle", `${tag}.sql`), path.join(drizzle, `${tag}.sql`));
}
for (const filename of deployFiles) {
  await copyFile(path.join(root, "deploy", filename), path.join(deploy, filename));
}

const relativeFiles = [
  "bin/reconcile.cjs",
  ...tags.map(tag => `drizzle/${tag}.sql`),
  ...deployFiles.map(filename => `deploy/${filename}`),
];
const files = {};
for (const relative of relativeFiles) {
  const absolute = path.join(out, relative);
  const content = await readFile(absolute);
  files[relative] = { bytes: content.length, sha256: await sha256(absolute) };
}

const manifest = {
  schemaVersion: 1,
  recordType: "aurion_production_schema_reconcile_artifact",
  revision,
  nodeTarget: "node22",
  moduleFormat: "commonjs",
  mode: "read_only",
  files,
};
await writeFile(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });

const checksumLines = [];
for (const relative of ["manifest.json", ...relativeFiles]) {
  checksumLines.push(`${await sha256(path.join(out, relative))}  ${relative}`);
}
await writeFile(path.join(out, "checksums.sha256"), `${checksumLines.join("\n")}\n`, { mode: 0o644 });

console.log(JSON.stringify({ revision, artifact: "dist-production-reconcile", files: Object.keys(files).length }));
