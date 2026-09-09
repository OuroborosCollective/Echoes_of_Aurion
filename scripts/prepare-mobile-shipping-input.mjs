/** Bind existing production LODs as input data; never regenerate WASD collision. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = process.argv[2];
if (!output) throw Error('OUTPUT_MANIFEST_REQUIRED');
const catalogBytes = await readFile('shared/worldAssetCatalog.json');
const collisionBytes = await readFile('shared/worldCollisionManifest.json');
const catalog = JSON.parse(catalogBytes), collision = JSON.parse(collisionBytes);
const ids = process.argv.slice(3);
if (!ids.length || new Set(ids).size !== ids.length) throw Error('DISTINCT_CATALOG_ASSET_IDS_REQUIRED');
const assets = [];
for (const id of ids.toSorted()) {
  const asset = catalog.assets.find(asset => asset.id === id);
  if (!asset) throw Error('CATALOG_ASSET_REQUIRED');
  const lods = [];
  for (const [index, lod] of asset.lods.entries()) {
    const file = lod.url.replace('/world-assets/', '');
    const bytes = await readFile(path.join('client/public/world-assets', file));
    if (hash(bytes) !== lod.sha256 || bytes.length !== lod.bytes) throw Error('SOURCE_LOD_HASH');
    lods.push({name: `LOD${index}`, file, sha256: lod.sha256});
  }
  let collider;
  if (asset.collider) {
    const file = asset.collider.url.replace('/world-assets/', '');
    const bytes = await readFile(path.join('client/public/world-assets', file));
    if (hash(bytes) !== asset.collider.sha256) throw Error('SOURCE_COLLIDER_HASH');
    collider = {file, sha256: asset.collider.sha256};
  }
  assets.push({asset: id, lods, ...(collider ? {collider} : {}), topology: {
    collisionManifestSha256: collision.manifestSha256,
    confirmedCollider: collision.colliders.find(collider => collider.assetId === id) ?? null,
  }});
}
const manifest = {sourceBinding: {catalogHash: catalog.bundleSha256, catalogFileSha256: hash(catalogBytes),
  collisionHash: collision.manifestSha256, collisionFileSha256: hash(collisionBytes), sourceArchives: catalog.sourceArchives}, assets};
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, JSON.stringify(manifest, null, 2)+'\n');
console.log(JSON.stringify({assets: ids.toSorted(), inputManifestSha256: hash(Buffer.from(JSON.stringify(manifest)))}));
