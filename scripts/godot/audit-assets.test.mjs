import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectGlb, inventory } from './audit-assets.mjs';
import { repo } from './toolchain.mjs';

const player = await readFile(resolve(repo, 'assets/characters/aurion-player-standard-animated.glb'));
function changedDocument(mutate) {
  const end = 20 + player.readUInt32LE(12);
  const doc = JSON.parse(player.toString('utf8', 20, end));
  mutate(doc);
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const bytes = Buffer.concat([player.subarray(0, 12), Buffer.alloc(8), padded, player.subarray(end)]);
  bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16);
  return bytes;
}
test('actual animated humanoid exposes geometry, 32 joints, clips and source identity', () => {
  const info = inspectGlb(player);
  assert.equal(info.sha256, '2f447361e6ba5e6e38d8b38c19b78773a0d62fcf80e771d34f3d94a0e64765cc');
  assert.equal(info.triangles, 2996);
  assert.equal(info.skins[0].joints.length, 32);
  assert.deepEqual(info.animations.map(clip => clip.name), ['AttackCombo', 'Death', 'Fight', 'Idle', 'Jump', 'Run', 'Walk']);
  assert.ok(info.animations.every(clip => clip.channels > 0));
});
test('malformed bytes, external references, unsupported primitive and invalid ranges fail closed', () => {
  for (const bytes of [Buffer.alloc(20), player.subarray(0, player.length - 1), ...[
    doc => { doc.buffers[0].uri = 'https://example.invalid/model.bin'; },
    doc => { doc.images[0].uri = '../../secret'; },
    doc => { doc.bufferViews[0].byteOffset = -1; },
    doc => { doc.bufferViews[0].byteLength = player.length * 2; },
    doc => { doc.meshes[0].primitives[0].indices = 100000; },
    doc => { doc.meshes[0].primitives[0].mode = 1; },
    doc => { doc.skins[0].joints[0] = -1; },
    doc => { doc.buffers[0].byteLength = -1; },
    doc => { doc.meshes = []; },
  ].map(changedDocument)]) assert.throws(() => inspectGlb(bytes));
});
test('inventory reads all committed source GLBs and keeps 49 external identities distinct', async () => {
  const result = await inventory();
  assert.equal(result.sources.length, 12);
  assert.equal(result.externalReferences.length, 49);
  assert.ok(result.sources.every(source => source.path.startsWith('assets/') && source.images.every(image => image.width > 0 && image.height > 0)));
  assert.ok(result.sources.every(source => source.extensionsRequired.length === 0));
  assert.ok(result.externalReferences.every(source => source.repositoryBytesPresent === false));
  assert.match(result.truthNotice, /No shipping admission/);
});
