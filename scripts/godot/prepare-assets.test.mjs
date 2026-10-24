import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareAssets, sha256 } from './prepare-assets.mjs';
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
});

test('output is constrained to the repository', async () => {
  await assert.rejects(prepareAssets({ outputDirectory: resolve(repo, '..', 'escaped-assets') }), /OUTPUT_OUTSIDE_REPOSITORY/);
});
