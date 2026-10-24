// Source inventory, not Aurion's upload admission or gameplay authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { repo, run } from './toolchain.mjs';

export function inspectGlb(bytes) {
  assert.ok(bytes.length >= 28 && bytes.length <= 24 * 1024 * 1024, 'GLB_SIZE');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'GLB_MAGIC');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB_VERSION');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB_LENGTH');
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  assert.ok(jsonEnd % 4 === 0 && jsonEnd + 8 <= bytes.length, 'GLB_JSON_BOUNDS');
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB_JSON_FIRST');
  assert.equal(bytes.readUInt32LE(jsonEnd + 4), 0x004e4942, 'GLB_BIN_REQUIRED');
  const binaryLength = bytes.readUInt32LE(jsonEnd);
  assert.equal(jsonEnd + 8 + binaryLength, bytes.length, 'GLB_BINARY_BOUNDS');
  const doc = JSON.parse(bytes.toString('utf8', 20, jsonEnd).trim());
  assert.equal(doc.asset?.version, '2.0', 'GLTF_VERSION');
  const pending = [doc]; let visited = 0;
  while (pending.length) {
    assert.ok(++visited <= 250000, 'GLB_COMPLEXITY');
    for (const [key, value] of Object.entries(pending.pop())) {
      assert.notEqual(key, 'uri', 'GLB_EXTERNAL_RESOURCE');
      if (value && typeof value === 'object') pending.push(value);
    }
  }
  const get = (entries, index) => {
    assert.ok(Array.isArray(entries) && Number.isSafeInteger(index) && index >= 0 && index < entries.length, 'GLB_REFERENCE');
    return entries[index];
  };
  assert.equal(doc.buffers?.length, 1, 'GLB_BUFFER_COUNT');
  assert.ok(Number.isSafeInteger(doc.buffers[0].byteLength) && doc.buffers[0].byteLength > 0 && doc.buffers[0].byteLength <= binaryLength, 'GLB_BUFFER_LENGTH');
  for (const view of doc.bufferViews ?? []) {
    assert.equal(view.buffer, 0, 'GLB_BUFFER_REFERENCE');
    assert.ok(Number.isSafeInteger(view.byteLength) && view.byteLength >= 0 && Number.isSafeInteger(view.byteOffset ?? 0) && (view.byteOffset ?? 0) >= 0 && (view.byteOffset ?? 0) + view.byteLength <= doc.buffers[0].byteLength, 'GLB_VIEW_BOUNDS');
  }
  let triangles = 0;
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4, 'GLB_NON_TRIANGLE_PRIMITIVE');
    const accessor = get(doc.accessors, primitive.indices ?? primitive.attributes.POSITION);
    assert.ok(Number.isSafeInteger(accessor.count) && accessor.count > 0 && accessor.count % 3 === 0, 'GLB_TRIANGLE_COUNT');
    triangles += accessor.count / 3;
  }
  assert.ok(triangles > 0 && doc.scenes?.length > 0, 'GLB_EMPTY_SCENE');
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    triangles, meshes: doc.meshes.length, materials: doc.materials?.length ?? 0,
    images: (doc.images ?? []).map(image => {
      const view = get(doc.bufferViews, image.bufferView);
      return { mimeType: image.mimeType, bytes: view.byteLength };
    }),
    skins: (doc.skins ?? []).map(skin => ({ joints: skin.joints.map(index => get(doc.nodes, index).name ?? `node_${index}`) })),
    animations: (doc.animations ?? []).map(clip => ({ name: clip.name, channels: clip.channels.length, samplers: clip.samplers.length })),
    extensionsUsed: doc.extensionsUsed ?? [], extensionsRequired: doc.extensionsRequired ?? [],
  };
}

export async function inventory() {
  const paths = run('git', ['-C', repo, 'ls-files', 'assets']).split('\n').filter(path => path.endsWith('.glb')).sort();
  const manifest = JSON.parse(await readFile(resolve(repo, 'godot-client/assets/catalog/source-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.entries.map(entry => entry.path).sort(), paths, 'SOURCE_MANIFEST_COVERAGE');
  const sources = [];
  for (const path of paths) {
    const declared = manifest.entries.find(entry => entry.path === path);
    const actual = inspectGlb(await readFile(resolve(repo, path)));
    assert.equal(actual.sha256, declared.sha256, `SOURCE_HASH_CHANGED: ${path}`);
    assert.equal(actual.bytes, declared.bytes, `SOURCE_SIZE_CHANGED: ${path}`);
    await readFile(resolve(repo, declared.provenance));
    sources.push({ ...declared, ...actual });
  }
  const textures = spawnSync('python3', [resolve(repo, 'scripts/godot/asset-image-metadata.py')], { input: JSON.stringify(paths), encoding: 'utf8', timeout: 30000 });
  assert.ok(!textures.error && textures.status === 0, `ASSET_TEXTURE_READBACK: ${textures.stderr}`);
  const dimensions = JSON.parse(textures.stdout);
  for (const source of sources) source.images = source.images.map((image, index) => ({ ...image, ...dimensions[source.path][index] }));
  const registry = await readFile(resolve(repo, 'shared/aurionMonsterAssetRegistry.ts'), 'utf8');
  const externalReferences = [...registry.matchAll(/speciesId: "([^"]+)"[^\n]*sha256: "([a-f0-9]{64})"/g)].map(([, speciesId, sha256]) => ({ speciesId, sha256, repositoryBytesPresent: sources.some(source => source.sha256 === sha256) }));
  return { schemaVersion: 'aurion.godot-source-assets.v1', sourceRevision: run('git', ['-C', repo, 'rev-parse', 'HEAD']), toolchainHash: createHash('sha256').update(await readFile(resolve(repo, 'config/godot-toolchain.lock.json'))).digest('hex'), sources, externalReferences, truthNotice: 'Source bytes only. No shipping admission, live assignment, Godot import, animation quality or physical-device claim.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await inventory();
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(result, null, 2) + '\n');
  else console.log(JSON.stringify(result, null, 2));
}
