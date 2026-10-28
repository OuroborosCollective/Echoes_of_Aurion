import test from 'node:test';
import assert from 'node:assert/strict';
import { checkVillageAssets, verifyVillageManifestShape } from './check-starter-village-assets.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from './check-starter-village-assets.mjs';

test('all eight admitted GLBs match their actual cryptographic bytes', async () => {
  const proof=await checkVillageAssets();
  assert.equal(proof.models,8);
  assert.equal(proof.hashesVerified,true);
  assert.ok(proof.triangles>0);
});
test('untrusted models, mismatched sizes and excessive textures are refused', async () => {
  const baseline=JSON.parse(await readFile(resolve(ROOT,'manifest.json'),'utf8'));
  const altered=structuredClone(baseline);
  altered.models[0].name='Untracked_New_Gameplay_Model';
  assert.throws(()=>verifyVillageManifestShape(altered),/G19_VILLAGE_EXACT_ALLOWLIST/);
  const bloated=structuredClone(baseline);
  bloated.models[0].size=1024*1024+1;
  assert.throws(()=>verifyVillageManifestShape(bloated),/G19_VILLAGE_FILE_BUDGET/);
  const badImage=structuredClone(baseline);
  badImage.models[0].images[0].size=[2048,2048];
  assert.throws(()=>verifyVillageManifestShape(badImage),/G19_VILLAGE_IMAGE_BUDGET/);
});
test('no client game-state authority is admitted through a GLB manifest', async () => {
  const manifest=JSON.parse(await readFile(resolve(ROOT,'manifest.json'),'utf8'));
  assert.equal(manifest.staticClientVisualsOnly,true);
  assert.ok(!('placements' in manifest));
  assert.ok(!('npcLogic' in manifest));
  assert.ok(!('worldSeed' in manifest));
});
