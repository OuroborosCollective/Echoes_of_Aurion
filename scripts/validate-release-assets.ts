import { readFile } from "node:fs/promises";
import { baselineReleaseAssets, assertReleaseAssetBudget } from "../shared/releaseAssetManifest";

const starterCharacterSource = await readFile(new URL("../client/src/game/starterCharacters.ts", import.meta.url), "utf8");
const referencedAssetKeys = [...starterCharacterSource.matchAll(/assetPath:\s*aurionAssets\.([A-Za-z]+)/g)].map(match => match[1]);
const expectedAssetKeys: string[] = [];

for (const asset of baselineReleaseAssets) assertReleaseAssetBudget(asset);
if (referencedAssetKeys.length !== expectedAssetKeys.length || referencedAssetKeys.some(key => !expectedAssetKeys.includes(key))) {
  throw new Error("Release-Asset-Manifest und auswählbare Standardcharaktere weichen voneinander ab.");
}

console.log(`Aurion release asset gate passed: ${baselineReleaseAssets.length} native GLBs; standard characters use the procedural runtime.`);
