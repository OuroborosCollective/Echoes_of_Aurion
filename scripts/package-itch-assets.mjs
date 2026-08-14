import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = "/home/ubuntu/webdev-static-assets/aurion";
const outputDirectory = path.join(projectRoot, "dist", "itch", "aurion-assets");
const files = [
  "aurion-wayfinder-animated_6bf370ef.glb",
  "aurion-veilguard-animated_d6b28a5b.glb",
  "env_asterion_floor_kit_a01.glb",
  "env_asterion_archway_a01.glb",
  "aurion-expedition-theme_a8401a12.mp3",
  "aurion-hero-trailer-en-de_c44ee2e1.mp4",
  "aurion-social-keyframe_5edc4882.png",
];

await mkdir(outputDirectory, { recursive: true });
for (const filename of files) {
  const source = path.join(sourceDirectory, filename);
  await stat(source);
  await copyFile(source, path.join(outputDirectory, filename));
}
console.log(`Aurion itch assets packaged: ${files.length} files.`);
