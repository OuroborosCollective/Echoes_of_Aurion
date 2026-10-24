import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inventory, inspectGlb } from './audit-assets.mjs';
import { executable, repo, root, digest, run, lock } from './toolchain.mjs';

const render = process.argv.includes('--render');
const directory = resolve(process.env.AURION_ASSET_EVIDENCE || join(root, 'asset-evidence'));
await mkdir(directory, { recursive: true });
await rm(join(directory, render ? 'render-evidence.json' : 'import-evidence.json'), { force: true });
assert.equal(run(executable, ['--headless', '--version']), lock.engine.version);
run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
assert.equal(run('git', ['-C', repo, 'ls-files', '--others', '--exclude-standard', 'godot-client', 'scripts/godot']), '', 'commit probe source before evidence');
const sources = await inventory();
if (process.env.AURION_EXPECTED_REVISION) assert.equal(sources.sourceRevision, process.env.AURION_EXPECTED_REVISION);
async function probe(id, input, sourceRoot = repo, expectedFailure = '') {
  const inputFile = join(directory, `${id}-source.json`), outputFile = join(directory, `${id}-readback.json`);
  await writeFile(inputFile, JSON.stringify(input, null, 2) + '\n');
  await rm(outputFile, { force: true });
  const result = spawnSync(executable, [
    ...(render && !expectedFailure ? [] : ['--headless']), '--path', join(repo, 'godot-client'),
    '--rendering-method', 'gl_compatibility', '--audio-driver', 'Dummy', '--script', 'tests/audit_asset_import.gd',
  ], { cwd: repo, env: { ...process.env, AURION_ASSET_AUDIT_INPUT: inputFile, AURION_ASSET_AUDIT_OUTPUT: outputFile, AURION_ASSET_SOURCE_ROOT: sourceRoot, AURION_ASSET_RENDER_DIR: render && !expectedFailure ? join(directory, 'renders') : '' }, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
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
    assert.equal(render ? readback.display !== 'headless' : readback.display === 'headless', true);
    for (const record of readback.records) for (const capture of record.captures) assert.equal(await digest(join(directory, 'renders', capture.file)), capture.sha256);
  }
  return readback;
}
const result = await probe(render ? 'render' : 'import', sources);
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
const receipt = { schemaVersion: 'aurion.godot-asset-evidence.v1', sourceRevision: sources.sourceRevision, toolchainHash: sources.toolchainHash, editorHash: await digest(executable), sourceManifestHash: await digest(join(repo, 'godot-client/assets/catalog/source-manifest.json')), layer: render ? 'software-render' : 'headless-import', importedAssets: result.records.length, motionClips: result.records.reduce((sum, record) => sum + record.clips.length, 0), negativeControls: ['wrong-source-hash', 'wrong-source-transform', 'static-clip-with-valid-names'], result: 'passed' };
await writeFile(join(directory, render ? 'render-evidence.json' : 'import-evidence.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
