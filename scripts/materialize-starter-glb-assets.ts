import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { STARTER_GLB_BUILD_ASSET_LIST, type StarterGlbBuildAsset } from "../shared/starterGlbAssetManifest";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateGlb(bytes: Buffer, asset: StarterGlbBuildAsset): void {
  if (bytes.byteLength !== asset.glbBytes) throw new Error(`${asset.id}: GLB byte length mismatch`);
  if (bytes.byteLength < 12 || bytes.subarray(0, 4).toString("ascii") !== "glTF") throw new Error(`${asset.id}: invalid GLB magic`);
  if (bytes.readUInt32LE(4) !== 2) throw new Error(`${asset.id}: expected glTF 2.0 GLB`);
  if (bytes.readUInt32LE(8) !== bytes.byteLength) throw new Error(`${asset.id}: GLB declared length mismatch`);
  if (digest(bytes) !== asset.glbSha256) throw new Error(`${asset.id}: GLB SHA-256 mismatch`);
}

async function materialize(asset: StarterGlbBuildAsset): Promise<Record<string, unknown>> {
  const pieces: string[] = [];
  for (let index = 0; index < asset.partCount; index += 1) {
    const path = resolve(REPO_ROOT, `${asset.sourcePrefix}${String(index).padStart(3, "0")}`);
    const part = (await readFile(path, "utf8")).trim();
    if (!part || !BASE64_PATTERN.test(part)) throw new Error(`${asset.id}: invalid Base64 part ${index}`);
    pieces.push(part);
  }

  const compressed = Buffer.from(pieces.join(""), "base64");
  if (compressed.byteLength !== asset.compressedBytes) throw new Error(`${asset.id}: gzip byte length mismatch`);
  if (digest(compressed) !== asset.compressedSha256) throw new Error(`${asset.id}: gzip SHA-256 mismatch`);
  const glb = gunzipSync(compressed);
  validateGlb(glb, asset);

  const output = resolve(REPO_ROOT, asset.publicPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, compressed);
  return {
    id: asset.id,
    compressedBytes: compressed.byteLength,
    compressedSha256: asset.compressedSha256,
    glbBytes: glb.byteLength,
    glbSha256: asset.glbSha256,
    partCount: asset.partCount,
    publicUrl: asset.publicUrl,
  };
}

const receipt = [];
for (const asset of STARTER_GLB_BUILD_ASSET_LIST) receipt.push(await materialize(asset));
const receiptPath = resolve(REPO_ROOT, "client/public/game-assets/starter-glb-evidence.json");
await writeFile(receiptPath, `${JSON.stringify({ schemaVersion: "aurion.starter-glb-evidence.v1", assets: receipt }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "STARTER_GLB_ASSETS_MATERIALIZED", assets: receipt }, null, 2));
