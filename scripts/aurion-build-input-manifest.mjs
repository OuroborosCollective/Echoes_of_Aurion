import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const AURION_BUILD_INPUT_MANIFEST_SCHEMA = "aurion.build-input-manifest.v1";

export function canonicalJson(value) {
  if (value === null || value === undefined) return value === null ? "null" : "null";
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error("CANONICAL_NUMBER_NON_FINITE");
      return Object.is(value, -0) || value === 0 ? "0" : JSON.stringify(value);
    case "string": return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
      return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    default: throw new Error(`CANONICAL_VALUE_UNSUPPORTED:${typeof value}`);
  }
}
export function canonicalSha256(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}
async function fileSha256(file) {
  return `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`;
}
function matchRequired(source, pattern, error) {
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error(error);
  return match[1];
}

export async function buildAurionBuildInputManifest({ root = process.cwd(), revision }) {
  const normalizedRevision = String(revision ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalizedRevision)) throw new Error("BUILD_INPUT_REVISION_INVALID");

  const fixedFiles = [
    "package.json",
    "pnpm-lock.yaml",
    "Dockerfile",
    "docker-compose.traefik.yml",
    "scripts/build-aurion-traefik-runtime-artifact.mjs",
    "scripts/install-game-development-studio.mjs",
    "drizzle/meta/_journal.json",
  ];
  const files = {};
  for (const relative of fixedFiles) files[relative] = await fileSha256(path.join(root, relative));

  const patchesDir = path.join(root, "patches");
  const patches = {};
  for (const name of (await readdir(patchesDir)).sort()) {
    if (!name.endsWith(".patch")) continue;
    patches[`patches/${name}`] = await fileSha256(path.join(patchesDir, name));
  }

  const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
  const baseImage = matchRequired(
    dockerfile,
    /^FROM\s+([^\s]+)\s+AS\s+runtime\s*$/m,
    "BUILD_INPUT_BASE_IMAGE_MISSING",
  );
  if (!/^node:22[^@\s]*@sha256:[a-f0-9]{64}$/.test(baseImage)) throw new Error("BUILD_INPUT_BASE_IMAGE_NOT_DIGEST_PINNED");

  const installer = await readFile(path.join(root, "scripts/install-game-development-studio.mjs"), "utf8");
  const gameDevelopmentStudio = {
    sourceRepository: matchRequired(installer, /const SOURCE_REPOSITORY = "([^"]+)"/, "BUILD_INPUT_GDS_REPOSITORY_MISSING"),
    sourceRevision: matchRequired(installer, /const SOURCE_REVISION = "([a-f0-9]{40})"/, "BUILD_INPUT_GDS_REVISION_MISSING"),
    package: matchRequired(installer, /const EXPECTED_PACKAGE = "([^"]+)"/, "BUILD_INPUT_GDS_PACKAGE_MISSING"),
    version: matchRequired(installer, /const EXPECTED_VERSION = "([^"]+)"/, "BUILD_INPUT_GDS_VERSION_MISSING"),
  };

  const manifest = {
    schemaVersion: AURION_BUILD_INPUT_MANIFEST_SCHEMA,
    sourceRevision: normalizedRevision,
    runtimeBaseImage: baseImage,
    gameDevelopmentStudio,
    files,
    patches,
  };
  return { manifest, digest: canonicalSha256(manifest) };
}

export async function writeAurionBuildInputManifest({ root = process.cwd(), revision, output }) {
  const result = await buildAurionBuildInputManifest({ root, revision });
  await writeFile(output, `${JSON.stringify({ ...result.manifest, buildInputDigest: result.digest }, null, 2)}\n`, "utf8");
  return result;
}
