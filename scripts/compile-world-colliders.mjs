// Derive ground-plane collision from the exact supplied GLB vertices, not metadata boxes.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import { audit } from "./world-glb-geometry.mjs";

const sha = data => createHash("sha256").update(data).digest("hex");
const catalogBytes = await readFile("shared/worldAssetCatalog.json");
const catalog = JSON.parse(catalogBytes);
const packed = await readFile("assets/world/mobile-world-assets.bundle.br");
if (sha(packed) !== catalog.bundleSha256)
  throw Error("COLLIDER_BUNDLE_HASH_MISMATCH");
const unpacked = brotliDecompressSync(packed, { maxOutputLength: 50_000_000 });
const length = unpacked.readUInt32LE(0);
if (length > 1_000_000) throw Error("COLLIDER_INDEX_INVALID");
const index = JSON.parse(unpacked.subarray(4, 4 + length));
const files = new Map();
let offset = 4 + length;
for (const file of index) {
  const bytes = unpacked.subarray(offset, offset + file.bytes);
  offset += file.bytes;
  if (files.has(file.path) || sha(bytes) !== file.sha256)
    throw Error("COLLIDER_FILE_HASH_MISMATCH");
  files.set(file.path, bytes);
}
if (offset !== unpacked.length) throw Error("COLLIDER_BUNDLE_INCOMPLETE");

const cross = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function convexHull(points) {
  const sorted = [...new Map(points.map(p => [p.join(","), p])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  const chain = list => {
    const out = [];
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...chain(sorted), ...chain([...sorted].reverse())];
}
const colliders = catalog.assets
  .filter(a => a.collider)
  .map(asset => {
    const bytes = files.get(asset.collider.url.replace("/world-assets/", ""));
    if (
      !bytes ||
      sha(bytes) !== asset.collider.sha256 ||
      bytes.length !== asset.collider.bytes
    )
      throw Error("COLLIDER_SOURCE_MISMATCH");
    const geometry = audit(bytes, 64);
    if (
      JSON.stringify(geometry.bounds) !== JSON.stringify(asset.collider.bounds)
    )
      throw Error("COLLIDER_BOUNDS_DRIFT");
    const centerX = (asset.bounds.min[0] + asset.bounds.max[0]) / 2,
      centerZ = (asset.bounds.min[2] + asset.bounds.max[2]) / 2;
    const points = geometry.vertices.map(([x, , z]) => [
      Math.round((x - centerX) * asset.scale * 1000),
      Math.round((z - centerZ) * asset.scale * 1000),
    ]);
    // One neighbouring chunk suffices for every hull, including the player radius.
    if (
      points.some(p =>
        p.some(v => !Number.isSafeInteger(v) || Math.abs(v) > 30_000)
      )
    )
      throw Error("COLLIDER_STREAMING_EXTENT_EXCEEDED");
    const hullMm = convexHull(points);
    if (hullMm.length < 3) throw Error("COLLIDER_FOOTPRINT_DEGENERATE");
    return { assetId: asset.id, sourceSha256: asset.collider.sha256, hullMm };
  });
if (colliders.length !== 112) throw Error("COLLIDER_COUNT_MISMATCH");
const payload = {
  version: "aurion-nature-collision.v1",
  policy: "convex-xz-swept-circle",
  playerRadiusMm: 350,
  quantizationMarginMm: 1,
  bundleSha256: catalog.bundleSha256,
  catalogSha256: sha(catalogBytes),
  colliders,
};
const output =
  JSON.stringify(
    { ...payload, manifestSha256: sha(JSON.stringify(payload)) },
    null,
    2
  ) + "\n";
const target = "shared/worldCollisionManifest.json";
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== output)
    throw Error("COLLIDER_MANIFEST_DRIFT");
} else await writeFile(target, output);
console.log(
  JSON.stringify({
    colliders: colliders.length,
    manifestSha256: sha(JSON.stringify(payload)),
    verified: true,
  })
);
