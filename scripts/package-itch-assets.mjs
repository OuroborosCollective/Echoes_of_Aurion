import { access, copyFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist", "itch", "aurion-assets");
const staticSource = (process.env.AURION_STATIC_SOURCE ?? "https://aurion3d-6hpapr2g.manus.space").replace(/\/$/, "");
const localAssetCache = process.env.AURION_ASSET_CACHE ?? path.join(process.env.HOME ?? "", "webdev-static-assets", "aurion");
const ambientWorldFiles = ["ambient-forest-world.wav", "ambient-cave-world.wav", "ambient-city-world.wav", "ambient-boss-dungeon-world.wav"];
const sfxFiles = [
  "combat-attack-sharp.wav", "combat-attack-pointed.wav", "combat-attack-blunt.wav", "combat-spell-heal.wav", "combat-spell-buff.wav",
  "combat-creature-wolf-attack.wav", "combat-creature-human-attack.wav", "combat-creature-monster-attack.wav",
  "combat-creature-wolf-death.wav", "combat-creature-human-death.wav", "combat-creature-monster-death.wav",
  "movement-run-earth.wav", "movement-run-grass.wav", "movement-run-stone.wav", "movement-run-wood.wav", "movement-run-water.wav",
  "interaction-loot-screw-pouch.wav", "resource-harvest-plant.wav", "resource-harvest-wood.wav", "resource-mine-ore.wav", "crafting-workbench-saw.wav",
];
const files = [
  { source: "aurion-wayfinder-animated_6bf370ef.glb", target: "aurion-wayfinder-animated_6bf370ef.glb", cacheSource: "aurion-wayfinder-animated_6bf370ef.glb" },
  { source: "aurion-veilguard-animated_d6b28a5b.glb", target: "aurion-veilguard-animated_d6b28a5b.glb", cacheSource: "aurion-veilguard-animated_d6b28a5b.glb" },
  { source: "env_asterion_floor_kit_a01_ec94e853.glb", target: "env_asterion_floor_kit_a01.glb", cacheSource: "env_asterion_floor_kit_a01.glb" },
  { source: "env_asterion_archway_a01_fe233f19.glb", target: "env_asterion_archway_a01.glb", cacheSource: "env_asterion_archway_a01.glb" },
  { source: "aurion-expedition-theme_a8401a12.mp3", target: "aurion-expedition-theme_a8401a12.mp3" },
  { source: "aurion-hero-trailer-en-de_c44ee2e1.mp4", target: "aurion-hero-trailer-en-de_c44ee2e1.mp4" },
  { source: "aurion-social-keyframe_5edc4882.png", target: "aurion-social-keyframe_5edc4882.png" },
];

const execFileAsync = promisify(execFile);

async function downloadReleaseAsset(source, target) {
  const outputPath = path.join(outputDirectory, target);
  await execFileAsync("curl", [
    "--fail",
    "--location",
    "--retry", "3",
    "--retry-all-errors",
    "--connect-timeout", "15",
    "--max-time", "120",
    "--output", outputPath,
    `${staticSource}/manus-storage/${source}`,
  ]);
}

async function copyCachedAsset(cacheSource, target) {
  const sourcePath = path.join(localAssetCache, cacheSource);
  try {
    await access(sourcePath);
    await copyFile(sourcePath, path.join(outputDirectory, target));
    return true;
  } catch {
    return false;
  }
}

await mkdir(outputDirectory, { recursive: true });
for (const file of files) {
  const copiedFromCache = await copyCachedAsset(file.cacheSource ?? file.source, file.target);
  if (!copiedFromCache) await downloadReleaseAsset(file.source, file.target);
}
for (const filename of ambientWorldFiles) {
  await copyFile(path.join(projectRoot, "public", "audio", filename), path.join(outputDirectory, filename));
}
for (const filename of sfxFiles) {
  await copyFile(path.join(projectRoot, "public", "audio", "sfx", filename), path.join(outputDirectory, filename));
}
console.log(`Aurion itch assets packaged from ${staticSource}: ${files.length} remote/cache files, ${ambientWorldFiles.length} local ambient files and ${sfxFiles.length} local SFX files.`);
