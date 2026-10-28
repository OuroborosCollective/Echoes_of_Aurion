import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGlb } from './audit-assets.mjs';

export const ROOT = resolve(fileURLToPath(new URL('../../godot-client/assets/starter_village/', import.meta.url)));
const EXPECTED = Object.freeze(['Barrel','Bush_Common','Door_1_Flat','Prop_WoodenFence_Single','Roof_RoundTiles_4x4','Stall_Empty','Wall_Plaster_Door_Flat','Wall_Plaster_Straight']);

export function verifyVillageManifestShape(manifest) {
  assert.equal(manifest.schemaVersion, 'aurion.starter-village-visual-mapping.v1');
  assert.equal(manifest.license, 'CC0-1.0 Quaternius');
  assert.match(manifest.sourceKitSha256, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(manifest.models));
  assert.deepEqual(manifest.models.map(m=>m.name).sort(), [...EXPECTED].sort(), 'G19_VILLAGE_EXACT_ALLOWLIST');
  let total=0;
  for(const m of manifest.models){
    assert.ok(['medieval','props','nature'].includes(m.pack),'G19_VILLAGE_SOURCE_PACK');
    assert.match(m.sha256,/^[a-f0-9]{64}$/,'G19_VILLAGE_SOURCE_SHA');
    assert.match(m.originalSha256,/^[a-f0-9]{64}$/,'G19_VILLAGE_ORIGINAL_SHA');
    assert.ok(Number.isSafeInteger(m.size)&&m.size>0&&m.size<=1024*1024,'G19_VILLAGE_FILE_BUDGET');
    assert.ok(Array.isArray(m.images)&&m.images.length>0&&m.images.length<=12,'G19_VILLAGE_IMAGES');
    for(const image of m.images){
      assert.ok(Array.isArray(image.size)&&image.size.length===2,'G19_VILLAGE_IMAGE_DIMENSIONS');
      assert.ok(image.size.every(v=>Number.isInteger(v)&&v>0&&v<=384),'G19_VILLAGE_IMAGE_BUDGET');
    }
    total+=m.size;
  }
  assert.ok(total<=4*1024*1024, 'G19_VILLAGE_TOTAL_BYTE_BUDGET');
  return total;
}

export async function checkVillageAssets(root=ROOT){
  const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
  const bytes=verifyVillageManifestShape(manifest);
  const license=await readFile(resolve(root,'QUATERNIUS_CC0_LICENSE.txt'),'utf8');
  assert.match(license,/CC0 1\.0 Universal/);
  assert.match(license,/Models by @Quaternius/);
  let triangles=0;
  for(const m of manifest.models){
    const bytes=await readFile(resolve(root,m.name+'.glb'));
    assert.equal(bytes.length,m.size,'G19_VILLAGE_FILE_SIZE:'+m.name);
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,m.sha256,'G19_VILLAGE_BINARY_SHA:'+m.name);
    const observed=inspectGlb(bytes);
    assert.equal(observed.images.length,m.images.length,'G19_VILLAGE_EMBEDDED_TEXTURES:'+m.name);
    triangles+=observed.triangles;
  }
  return {models:manifest.models.length,bytes,triangles,hashesVerified:true,licenseVerified:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const evidence=await checkVillageAssets();
  console.log('G19_STARTER_VILLAGE_ASSET_SHA_PASS '+JSON.stringify(evidence));
}
