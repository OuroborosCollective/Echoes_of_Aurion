import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertPreparedRecord, prepareAssets, requireCleanSourceInventory, sha256 } from './prepare-assets.mjs';
import { repo } from './toolchain.mjs';

const output = resolve(repo, '.aurion-godot/prepare-assets-test');

test('two clean preparations are stable and remove stale outputs', async t => {
  t.after(() => rm(output, { recursive: true, force: true }));
  const first = await prepareAssets({ outputDirectory: output });
  const firstManifest = await readFile(first.manifestPath);
  assert.equal(first.manifest.sources.length, 12);
  assert.ok(first.manifest.sources.every(source => source.sourceSha256 === source.outputSha256));
  assert.ok(first.manifest.sources.every(source => !source.path.startsWith('/') && source.path.endsWith('.glb')));
  await writeFile(resolve(output, 'stale.glb'), 'must be removed');
  const second = await prepareAssets({ outputDirectory: output });
  const secondManifest = await readFile(second.manifestPath);
  assert.equal(sha256(secondManifest), sha256(firstManifest));
  await assert.rejects(readFile(resolve(output, 'stale.glb')), { code: 'ENOENT' });
  assert.deepEqual(
    second.manifest.sources.map(source => source.outputSha256),
    first.manifest.sources.map(source => source.outputSha256),
  );
  const prepared = first.manifest.sources[0];
  const original = { ...prepared, path: prepared.sourcePath };
  assert.doesNotThrow(() => assertPreparedRecord(prepared, original));
  assert.throws(
    () => assertPreparedRecord({ ...prepared, path: `godot-client/assets/generated/../../../../${prepared.sourcePath}` }, original),
    /PREPARED_ASSET_PATH/,
  );
  assert.throws(
    () => assertPreparedRecord({ ...prepared, animations: prepared.animations.slice(0, 1) }, original),
    /PREPARED_ANIMATIONS_CHANGED/,
  );
});

test('output is constrained to the repository', async () => {
  await assert.rejects(prepareAssets({ outputDirectory: resolve(repo, '..', 'escaped-assets') }), /OUTPUT_OUTSIDE_REPOSITORY/);
});

test('dirty source provenance is rejected', () => {
  assert.throws(() => requireCleanSourceInventory({ workingTreeClean: false }), /SOURCE_WORKTREE_DIRTY/);
});

test('symlinked output is rejected before recursive cleanup', async t => {
  const target = resolve(repo, '.aurion-godot/prepare-assets-symlink-target');
  t.after(async () => {
    await rm(output, { force: true });
    await rm(target, { recursive: true, force: true });
  });
  await rm(output, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, 'sentinel'), 'preserve');
  await symlink(target, output, 'dir');
  await assert.rejects(prepareAssets({ outputDirectory: output }), /OUTPUT_SYMLINK/);
  assert.equal(await readFile(resolve(target, 'sentinel'), 'utf8'), 'preserve');
});
