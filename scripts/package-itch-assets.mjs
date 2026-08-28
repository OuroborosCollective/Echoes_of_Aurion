import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist", "itch", "aurion-assets");
const releaseAssetSource = (process.env.AURION_RELEASE_ASSET_SOURCE ?? "https://arelogic.space/aurion-assets").replace(/\/$/, "");
const legacyStaticSource = (process.env.AURION_STATIC_SOURCE ?? "https://aurion3d-6hpapr2g.manus.space").replace(/\/$/, "");
const localAssetCache = process.env.AURION_ASSET_CACHE ?? path.join(process.env.HOME ?? "", "webdev-static-assets", "aurion");
const integrityManifestPath = path.join(projectRoot, "shared", "releaseAssetIntegrity.json");
const integrityManifest = JSON.parse(await readFile(integrityManifestPath, "utf8"));
if (integrityManifest.schemaVersion !== 1 || !Array.isArray(integrityManifest.assets) || integrityManifest.assets.length === 0) {
  throw new Error("Aurion release asset integrity manifest is invalid or empty.");
}
const files = integrityManifest.assets;
const ambientWorldFiles = ["ambient-forest-world.wav", "ambient-cave-world.wav", "ambient-city-world.wav", "ambient-boss-dungeon-world.wav"];
const sfxFiles = [
  "combat-attack-sharp.wav", "combat-attack-pointed.wav", "combat-attack-blunt.wav", "combat-spell-heal.wav", "combat-spell-buff.wav",
  "combat-creature-wolf-attack.wav", "combat-creature-human-attack.wav", "combat-creature-monster-attack.wav",
  "combat-creature-wolf-death.wav", "combat-creature-human-death.wav", "combat-creature-monster-death.wav",
  "movement-run-earth.wav", "movement-run-grass.wav", "movement-run-stone.wav", "movement-run-wood.wav", "movement-run-water.wav",
  "interaction-loot-screw-pouch.wav", "resource-harvest-plant.wav", "resource-harvest-wood.wav", "resource-mine-ore.wav", "crafting-workbench-saw.wav",
];

const execFileAsync = promisify(execFile);

function assertManifestEntry(file) {
  if (!file || typeof file !== "object") throw new Error("Invalid release asset entry.");
  for (const field of ["source", "target", "sha256"]) {
    if (typeof file[field] !== "string" || file[field].length === 0) throw new Error(`Release asset ${field} is required.`);
  }
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 1) throw new Error(`${file.target}: invalid expected byte count.`);
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`${file.target}: invalid expected SHA-256.`);
  if (path.basename(file.target) !== file.target || path.basename(file.source) !== file.source) throw new Error(`${file.target}: release asset filenames must be basenames.`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function verifyPackagedAsset(file, outputPath) {
  const fileStat = await stat(outputPath);
  if (fileStat.size !== file.bytes) {
    throw new Error(`${file.target}: byte mismatch; expected ${file.bytes}, observed ${fileStat.size}.`);
  }
  const digest = await sha256(outputPath);
  if (digest !== file.sha256) {
    throw new Error(`${file.target}: SHA-256 mismatch; expected ${file.sha256}, observed ${digest}.`);
  }
  return digest;
}

async function removeIfPresent(filePath) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function copyCachedAsset(file) {
  const sourcePath = path.join(localAssetCache, file.cacheSource ?? file.source);
  const outputPath = path.join(outputDirectory, file.target);
  try {
    await access(sourcePath);
    await copyFile(sourcePath, outputPath);
    await verifyPackagedAsset(file, outputPath);
    console.log(`release_asset_verified target=${file.target} source=cache bytes=${file.bytes} sha256=${file.sha256}`);
    return true;
  } catch (error) {
    await removeIfPresent(outputPath);
    if (error?.code !== "ENOENT") {
      console.warn(`release_asset_cache_rejected target=${file.target} reason=${error instanceof Error ? error.message : "unknown"}`);
    }
    return false;
  }
}

async function downloadAndVerify(file, label, url) {
  const outputPath = path.join(outputDirectory, file.target);
  await removeIfPresent(outputPath);
  try {
    await execFileAsync("curl", [
      "--fail",
      "--location",
      "--retry", "3",
      "--retry-all-errors",
      "--connect-timeout", "15",
      "--max-time", "120",
      "--output", outputPath,
      url,
    ]);
    await verifyPackagedAsset(file, outputPath);
    console.log(`release_asset_verified target=${file.target} source=${label} bytes=${file.bytes} sha256=${file.sha256}`);
    return true;
  } catch (error) {
    await removeIfPresent(outputPath);
    console.warn(`release_asset_source_rejected target=${file.target} source=${label} reason=${error instanceof Error ? error.message : "unknown"}`);
    return false;
  }
}

async function resolveReleaseAsset(file) {
  assertManifestEntry(file);
  if (await copyCachedAsset(file)) return;

  const candidates = [
    { label: "release", url: `${releaseAssetSource}/${encodeURIComponent(file.target)}` },
    { label: "legacy", url: `${legacyStaticSource}/manus-storage/${encodeURIComponent(file.source)}` },
  ];
  for (const candidate of candidates) {
    if (await downloadAndVerify(file, candidate.label, candidate.url)) return;
  }
  throw new Error(`${file.target}: no approved source produced the expected immutable release asset.`);
}

await mkdir(outputDirectory, { recursive: true });
for (const file of files) await resolveReleaseAsset(file);
for (const filename of ambientWorldFiles) {
  await copyFile(path.join(projectRoot, "public", "audio", filename), path.join(outputDirectory, filename));
}
for (const filename of sfxFiles) {
  await copyFile(path.join(projectRoot, "public", "audio", "sfx", filename), path.join(outputDirectory, filename));
}
console.log(`Aurion itch assets packaged with immutable integrity verification: ${files.length} bound release files, ${ambientWorldFiles.length} local ambient files and ${sfxFiles.length} local SFX files.`);
