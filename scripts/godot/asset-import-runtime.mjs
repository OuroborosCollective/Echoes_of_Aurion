import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inventory, inspectGlb } from './audit-assets.mjs';
import { assertPreparedOutputFile, assertPreparedRecord } from './prepare-assets.mjs';
import { executable, repo, root, digest, run, lock } from './toolchain.mjs';

const render = process.argv.includes('--render');
const directory = resolve(process.env.AURION_ASSET_EVIDENCE || join(root, 'asset-evidence'));
await mkdir(directory, { recursive: true });
await rm(join(directory, render ? 'render-evidence.json' : 'import-evidence.json'), { force: true });
assert.equal(run(executable, ['--headless', '--version']), lock.engine.version);
run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
assert.equal(run('git', ['-C', repo, 'ls-files', '--others', '--exclude-standard', 'godot-client', 'scripts/godot']), '', 'commit probe source before evidence');
const auditedSources = await inventory();
const preparedManifestPath = process.env.AURION_PREPARED_ASSET_MANIFEST
  ? resolve(repo, process.env.AURION_PREPARED_ASSET_MANIFEST)
  : '';
const preparedManifestBytes = preparedManifestPath
  ? await readFile(preparedManifestPath)
  : null;
const sources = preparedManifestBytes
  ? JSON.parse(preparedManifestBytes)
  : auditedSources;
if (preparedManifestPath) {
  assert.equal(sources.schemaVersion, 'aurion.godot-prepared-assets.v1');
  assert.equal(sources.sourceRevision, auditedSources.sourceRevision);
  assert.equal(sources.toolchainHash, auditedSources.toolchainHash);
  assert.equal(sources.sourceManifestHash, await digest(join(repo, 'godot-client/assets/catalog/source-manifest.json')));
  const profileDocumentPath = join(repo, 'godot-client/assets/import_profiles.json');
  const profileDocumentBytes = await readFile(profileDocumentPath);
  const profileDocument = JSON.parse(profileDocumentBytes);
  assert.equal(sources.profileDocumentHash, createHash('sha256').update(profileDocumentBytes).digest('hex'));
  assert.equal(sources.sources.length, auditedSources.sources.length);
  assert.deepEqual(
    sources.sources.map(source => source.sourcePath).sort(),
    auditedSources.sources.map(source => source.path).sort(),
    'Prepared asset coverage changed',
  );
  const originals = new Map(auditedSources.sources.map(source => [source.path, source]));
  for (const source of sources.sources) {
    const original = originals.get(source.sourcePath);
    assert.ok(original, `Prepared asset has no audited source: ${source.sourcePath}`);
    assertPreparedRecord(source, original);
    await assertPreparedOutputFile(source);
    const expectedProfileId = profileDocument.roleProfiles[source.role] ?? profileDocument.defaultProfile;
    const expectedProfile = profileDocument.profiles[expectedProfileId];
    assert.ok(expectedProfile, `Prepared asset profile is missing: ${expectedProfileId}`);
    assert.equal(source.profileId, expectedProfileId);
    assert.equal(source.profileHash, createHash('sha256').update(JSON.stringify(expectedProfile)).digest('hex'));
  }
}
if (process.env.AURION_EXPECTED_REVISION) assert.equal(sources.sourceRevision, process.env.AURION_EXPECTED_REVISION);
async function probe(id, input, sourceRoot = repo, expectedFailure = '') {
  const shouldRender = render && !expectedFailure && !id.startsWith('synthetic-');
  const inputFile = join(directory, `${id}-source.json`), outputFile = join(directory, `${id}-readback.json`);
  await writeFile(inputFile, JSON.stringify(input, null, 2) + '\n');
  await rm(outputFile, { force: true });
  const result = spawnSync(executable, [
    ...(shouldRender ? [] : ['--headless']), '--path', join(repo, 'godot-client'),
    '--rendering-method', 'gl_compatibility', '--audio-driver', 'Dummy', '--script', 'tests/audit_asset_import.gd',
  ], { cwd: repo, env: { ...process.env, AURION_ASSET_AUDIT_INPUT: inputFile, AURION_ASSET_AUDIT_OUTPUT: outputFile, AURION_ASSET_SOURCE_ROOT: sourceRoot, AURION_ASSET_RENDER_DIR: shouldRender ? join(directory, 'renders') : '' }, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const log = (result.stdout || '') + (result.stderr || '');
  await writeFile(join(directory, `${id}.log`), log);
  assert.ok(!result.error, result.error?.message);
  const readback = JSON.parse(await readFile(outputFile, 'utf8'));
  assert.equal(readback.sourceRevision, sources.sourceRevision);
  if (expectedFailure) {
    assert.notEqual(result.status, 0, `${id} negative control unexpectedly passed`);
    assert.ok(readback.failures.some(message => message.includes(expectedFailure)), log);
  } else {
    assert.equal(result.status, 0, log);
    assert.match(log, /Godot source asset geometry, skeletons and clip motion verified/);
    assert.ok(!/(?:SCRIPT ERROR:|\bERROR:)/.test(log), log);
    assert.deepEqual(readback.failures, []);
    assert.deepEqual(readback.records.map(record => record.sha256), input.sources.map(source => source.sha256));
    assert.equal(shouldRender ? readback.display !== 'headless' : readback.display === 'headless', true);
    if (shouldRender) assert.match(readback.videoAdapter, /llvmpipe|softpipe|software/i, 'software-render receipt requires actual software adapter readback');
    for (const record of readback.records) for (const capture of record.captures) assert.equal(await digest(join(directory, 'renders', capture.file)), capture.sha256);
  }
  return readback;
}
const result = await probe(render ? 'render' : 'import', sources);
// Existing source meshes use identity transforms. An explicitly test-only GLB
// exercises the actual Godot boundary with quaternion rotation, nonuniform
// parent scale and a column-major child matrix. It is never a shipping asset.
const template = sources.sources.find(source => source.role === 'environment');
assert.equal(template.meshNodeTransforms.length, 1);
const original = await readFile(resolve(repo, template.path));
const originalJsonEnd = 20 + original.readUInt32LE(12);
const transformedDocument = JSON.parse(original.toString('utf8', 20, originalJsonEnd));
const meshIndex = template.meshNodeTransforms[0].nodeIndex;
const child = transformedDocument.nodes[meshIndex];
for (const key of ['translation', 'rotation', 'scale']) delete child[key];
child.matrix = [0,1,0,0,-1,0,0,0,0,0,1,0,1,2,3,1];
const parentIndex = transformedDocument.nodes.length;
transformedDocument.nodes.push({ name: 'G14SyntheticParent', translation:[5,6,7], rotation:[0,Math.SQRT1_2,0,Math.SQRT1_2], scale:[2,3,4], children:[meshIndex] });
transformedDocument.scenes[transformedDocument.scene || 0].nodes = [parentIndex];
const encoded = Buffer.from(JSON.stringify(transformedDocument));
const padded = Buffer.concat([encoded, Buffer.alloc((4-encoded.length%4)%4,32)]);
const transformedBytes = Buffer.concat([original.subarray(0,12),Buffer.alloc(8),padded,original.subarray(originalJsonEnd)]);
transformedBytes.writeUInt32LE(transformedBytes.length,8);transformedBytes.writeUInt32LE(padded.length,12);transformedBytes.writeUInt32LE(0x4e4f534a,16);
const syntheticPath = 'synthetic-transform-hierarchy.glb';
await writeFile(join(directory,syntheticPath),transformedBytes);
await probe('synthetic-transform-hierarchy',{...sources,sources:[{...template,...inspectGlb(transformedBytes),path:syntheticPath,meshNodeTransforms:[{...template.meshNodeTransforms[0],localMatrix:[0,-1,0,1,1,0,0,2,0,0,1,3,0,0,0,1],globalMatrix:[0,0,4,17,3,0,0,12,0,2,0,5,0,0,0,1]}]}]},directory);
const wrongHash = structuredClone(sources);
wrongHash.sources = [{ ...wrongHash.sources[0], sha256: '0'.repeat(64) }];
await probe('negative-source-hash', wrongHash, repo, 'Source hash changed');
const wrongTransform = structuredClone(sources);
wrongTransform.sources = [wrongTransform.sources[0]];
wrongTransform.sources[0].meshNodeTransforms[0].globalMatrix[3] += 1;
await probe('negative-source-transform', wrongTransform, repo, 'Imported global pivot/scale/orientation changed');
// Keep clip names and a valid skinned GLB, but flatten every Idle sampler.
// The real engine must reject the motion claim, not trust metadata or labels.
const player = sources.sources.find(source => source.role === 'character');
const flat = Buffer.from(await readFile(resolve(repo, player.path)));
const jsonEnd = 20 + flat.readUInt32LE(12), document = JSON.parse(flat.toString('utf8', 20, jsonEnd));
for (const sampler of document.animations.find(clip => clip.name === 'Idle').samplers) {
  const accessor = document.accessors[sampler.output], view = document.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  const size = ({ SCALAR: 1, VEC3: 3, VEC4: 4 })[accessor.type] * 4;
  assert.ok(size > 0);
  const offset = jsonEnd + 8 + (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || size;
  const first = Buffer.from(flat.subarray(offset, offset + size));
  for (let index = 1; index < accessor.count; index++) first.copy(flat, offset + index * stride);
}
const flattenedPath = 'negative-static-clip.glb';
await writeFile(join(directory, flattenedPath), flat);
const flattened = { ...sources, sources: [{ ...player, ...inspectGlb(flat), path: flattenedPath, animations: player.animations.filter(clip => clip.name === 'Idle') }] };
await probe('negative-static-clip', flattened, directory, 'Clip has no imported skeleton motion');
const receipt = { schemaVersion: 'aurion.godot-asset-evidence.v1', sourceRevision: sources.sourceRevision, toolchainHash: sources.toolchainHash, editorHash: await digest(executable), sourceManifestHash: await digest(join(repo, 'godot-client/assets/catalog/source-manifest.json')), preparedManifestHash: preparedManifestBytes ? createHash('sha256').update(preparedManifestBytes).digest('hex') : null, profileDocumentHash: sources.profileDocumentHash ?? null, layer: render ? 'software-render' : 'headless-import', videoAdapter: result.videoAdapter, importedAssets: result.records.length, motionClips: result.records.reduce((sum, record) => sum + record.clips.length, 0), positiveControls: ['nonidentity-parent-scale-rotation-child-matrix'], negativeControls: ['wrong-source-hash', 'wrong-source-transform', 'static-clip-with-valid-names'], result: 'passed' };
await writeFile(join(directory, render ? 'render-evidence.json' : 'import-evidence.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
