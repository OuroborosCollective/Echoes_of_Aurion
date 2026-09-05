import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const revision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase() ?? "";
if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error("AURION_RELEASE_SHA must be the exact 40-character source revision");
}

const root = process.cwd();
const output = path.join(root, "dist-traefik-runtime");
const filesToCopy = [
  "deploy/aurion-revision-alignment-controller.py",
  "deploy/aurion-revision-alignment-controller.service",
  "deploy/aurion-revision-alignment-controller.timer",
  "deploy/aurion-revision-alignment-controller.env.template",
  "Dockerfile",
  "docker-compose.traefik.yml",
  "package.json",
  "pnpm-lock.yaml",
  "deploy/promote-aurion-zone-runtime.sh",
  "deploy/aurion-traefik-runtime.environment.template",
  "deploy/verify-aurion-runtime-database.mjs",
];
const directoriesToCopy = ["dist", "patches"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const relative of filesToCopy) {
  await mkdir(path.dirname(path.join(output, relative)), { recursive: true });
  await cp(path.join(root, relative), path.join(output, relative), { force: true });
}
for (const relative of directoriesToCopy) {
  await cp(path.join(root, relative), path.join(output, relative), { recursive: true, force: true });
}

// Archive the exact dependency graph installed from the pinned lockfile on the
// hosted runner. pnpm's virtual-store symlinks are preserved as-is: copying to a
// staging directory and pruning there can drop a valid transitive runtime edge.
// The VPS receives only this immutable archive and never resolves or installs a
// package graph during promotion.
execFileSync("tar", ["-czf", path.join(output, "runtime-node_modules.tgz"), "node_modules"], {
  cwd: root,
  stdio: "inherit",
});
if ((await stat(path.join(output, "runtime-node_modules.tgz"))).size < 1) {
  throw new Error("runtime lockfile dependency archive is empty");
}

async function sha256(filePath) {
  return createHash("sha256").update(await (await import("node:fs/promises")).readFile(filePath)).digest("hex");
}

async function listFiles(directory, relative = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryRelative = path.posix.join(relative, entry.name);
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await listFiles(entryPath, entryRelative));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`runtime artifact may contain files only: ${entryRelative}`);
    }
    result.push(entryRelative);
  }
  return result;
}

const files = {};
for (const relative of (await listFiles(output)).sort()) {
  files[relative] = await sha256(path.join(output, relative));
}

const manifest = {
  schemaVersion: 1,
  recordType: "aurion_traefik_runtime_artifact",
  dependencyClosure: "hosted-lockfile-install",
  revision,
  files,
};
await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const checksums = [];
for (const relative of [...Object.keys(files), "manifest.json"].sort()) {
  checksums.push(`${await sha256(path.join(output, relative))}  ${relative}`);
}
await writeFile(path.join(output, "checksums.sha256"), `${checksums.join("\n")}\n`, "utf8");

for (const relative of Object.keys(files)) {
  const metadata = await stat(path.join(output, relative));
  if (!metadata.isFile()) throw new Error(`artifact entry is not a regular file: ${relative}`);
}
