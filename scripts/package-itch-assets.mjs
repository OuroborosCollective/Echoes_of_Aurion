import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist", "itch", "aurion-assets");
const staticSource = (process.env.AURION_STATIC_SOURCE ?? "https://aurion3d-6hpapr2g.manus.space").replace(/\/$/, "");
const files = [
  { source: "aurion-wayfinder-animated_6bf370ef.glb", target: "aurion-wayfinder-animated_6bf370ef.glb" },
  { source: "aurion-veilguard-animated_d6b28a5b.glb", target: "aurion-veilguard-animated_d6b28a5b.glb" },
  { source: "env_asterion_floor_kit_a01_ec94e853.glb", target: "env_asterion_floor_kit_a01.glb" },
  { source: "env_asterion_archway_a01_fe233f19.glb", target: "env_asterion_archway_a01.glb" },
  { source: "aurion-expedition-theme_a8401a12.mp3", target: "aurion-expedition-theme_a8401a12.mp3" },
  { source: "aurion-hero-trailer-en-de_c44ee2e1.mp4", target: "aurion-hero-trailer-en-de_c44ee2e1.mp4" },
  { source: "aurion-social-keyframe_5edc4882.png", target: "aurion-social-keyframe_5edc4882.png" },
];

await mkdir(outputDirectory, { recursive: true });
for (const file of files) {
  const response = await fetch(`${staticSource}/manus-storage/${file.source}`);
  if (!response.ok) throw new Error(`Aurion release asset could not be downloaded: ${file.source} (${response.status})`);
  await writeFile(path.join(outputDirectory, file.target), Buffer.from(await response.arrayBuffer()));
}
console.log(`Aurion itch assets packaged from ${staticSource}: ${files.length} files.`);
