import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareAssets } from './prepare-assets.mjs';
import { repo, executable } from './toolchain.mjs';

const manifestEntry = 'assets/assets/generated/manifest.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Fresh preparation is mandatory for every export, including owner signing. */
export async function stageAssetProject(project, revision) {
  const { manifest, manifestPath } = await prepareAssets();
  assert.equal(manifest.sourceRevision, revision, 'EXPORT_ASSET_REVISION');
  await cp(join(repo, 'godot-client'), project, {
    recursive: true,
    filter: path => !path.split('/').includes('.godot'),
  });
  const manifestBytes = await readFile(manifestPath);
  assert.equal(
    sha256(await readFile(join(project, 'assets/generated/manifest.json'))),
    sha256(manifestBytes),
    'STAGED_ASSET_MANIFEST_CHANGED',
  );
  return { manifest, manifestBytes };
}

/** JSON is not a Godot resource; include it explicitly in both export presets. */
export function includeAssetManifest(presets) {
  const original = 'include_filter="net/contracts/*.json,override.cfg"';
  assert.ok(presets.includes(original), 'EXPORT_INCLUDE_FILTER_CHANGED');
  return presets.replaceAll(original, 'include_filter="net/contracts/*.json,override.cfg,assets/generated/manifest.json"');
}

/**
 * Verify the actual APK's imported resources, not the staging directory.
 * The source/output GLB hashes remain provenance; Godot remaps GLBs to SCNs.
 */
export function verifyPackagedAssets({ manifest, manifestBytes, stagedImports, entries, readEntry }) {
  assert.equal(manifest.schemaVersion, 'aurion.godot-prepared-assets.v1');
  assert.equal(manifest.outputMode, 'byte-exact-compatible-copy');
  assert.match(manifest.sourceRevision, /^[0-9a-f]{40}$/);
  assert.ok(manifest.sources.length > 0, 'EMPTY_PREPARED_ASSETS');
  assert.deepEqual(JSON.parse(manifestBytes), manifest, 'EXPECTED_MANIFEST_BYTES_CHANGED');
  assert.ok(entries.includes(manifestEntry), 'PACKAGED_ASSET_MANIFEST_MISSING');
  const packagedManifest = readEntry(manifestEntry);
  assert.equal(sha256(packagedManifest), sha256(manifestBytes), 'PACKAGED_ASSET_MANIFEST_CHANGED');
  assert.equal(stagedImports.schemaVersion, 'aurion.godot-staged-imports.v1');
  assert.equal(stagedImports.sourceRevision, manifest.sourceRevision, 'STAGED_IMPORT_REVISION');
  assert.equal(stagedImports.manifestSha256, sha256(manifestBytes), 'STAGED_IMPORT_MANIFEST');
  assert.deepEqual(stagedImports.failures, [], 'STAGED_IMPORT_FAILURES');
  assert.equal(stagedImports.records.length, manifest.sources.length, 'STAGED_IMPORT_COVERAGE');
  const resources = [];
  const seen = new Set();
  for (const source of manifest.sources) {
    assert.match(source.assetId, /^glb_[0-9a-f]{48}$/);
    assert.match(source.outputSha256, /^[0-9a-f]{64}$/);
    assert.equal(source.assetId, 'glb_' + source.outputSha256.slice(0, 48), 'PACKAGED_ASSET_ID');
    assert.equal(source.sourceSha256, source.outputSha256, 'PACKAGED_SOURCE_OUTPUT_HASH');
    assert.equal(source.sha256, source.outputSha256, 'PACKAGED_AUDIT_OUTPUT_HASH');
    assert.equal(source.path, 'godot-client/assets/generated/' + source.assetId + '.glb', 'PACKAGED_ASSET_PATH');
    assert.equal(seen.has(source.assetId), false, 'DUPLICATE_PACKAGED_ASSET');
    seen.add(source.assetId);
    const remapEntry = 'assets/assets/generated/' + source.assetId + '.glb.remap';
    assert.ok(entries.includes(remapEntry), 'PACKAGED_ASSET_REMAP_MISSING: ' + source.assetId);
    const remap = readEntry(remapEntry).toString('utf8');
    const paths = [...remap.matchAll(/^path="(res:\/\/\.godot\/imported\/[a-zA-Z0-9_.-]+\.scn)"\s*$/gm)];
    assert.equal(paths.length, 1, 'PACKAGED_ASSET_REMAP_INVALID: ' + source.assetId);
    const importedEntry = 'assets/' + paths[0][1].slice('res://'.length);
    assert.ok(entries.includes(importedEntry), 'PACKAGED_IMPORTED_SCENE_MISSING: ' + source.assetId);
    const matches = stagedImports.records.filter(record => record.assetId === source.assetId);
    assert.equal(matches.length, 1, 'STAGED_IMPORT_IDENTITY');
    const staged = matches[0];
    assert.ok(staged.importedPath.startsWith('res://.godot/imported/' + source.assetId + '.glb-'), 'STAGED_IMPORT_BASENAME');
    assert.equal(importedEntry, 'assets/' + staged.importedPath.slice('res://'.length), 'PACKAGED_ASSET_REMAP_CHANGED');
    const bytes = readEntry(importedEntry);
    assert.equal(sha256(bytes), staged.importedSha256, 'PACKAGED_IMPORTED_SCENE_CHANGED');
    assert.ok(bytes.length > 16 && ['RSRC', 'RSCC'].includes(bytes.subarray(0, 4).toString('ascii')),
      'PACKAGED_IMPORTED_SCENE_INVALID: ' + source.assetId);
    resources.push({
      assetId: source.assetId,
      sourceSha256: source.sourceSha256,
      outputSha256: source.outputSha256,
      importedEntry,
      importedBytes: bytes.length,
      importedSha256: sha256(bytes),
    });
  }
  return {
    schemaVersion: 'aurion.godot-packaged-assets.v1',
    sourceRevision: manifest.sourceRevision,
    toolchainHash: manifest.toolchainHash,
    manifestSha256: sha256(packagedManifest),
    resources,
    layer: 'android-imported-resource-package-readback',
    device: 'unverified',
  };
}

/** Real Godot loads the imported PackedScenes before their bytes are trusted. */
export async function verifyStagedAssetImports(project, prepared, env) {
  const output = join(project, '..', 'staged-assets.json');
  const result = spawnSync(executable, [
    '--headless', '--path', project, '--script', 'tests/test_asset_import.gd',
  ], {
    env: { ...env, AURION_EXPECTED_REVISION: prepared.manifest.sourceRevision, AURION_STAGED_ASSET_OUTPUT: output },
    encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  const log = (result.stdout || '') + (result.stderr || '');
  assert.ok(!result.error && result.status === 0 && !/(?:SCRIPT ERROR:|\bERROR:)/.test(log)
    && log.includes('Godot staged PackedScene assets and animation motion verified'), 'STAGED_IMPORT_RUNTIME_FAILED: ' + log);
  const stagedImports = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(stagedImports.failures, []);
  assert.equal(stagedImports.records.length, prepared.manifest.sources.length);
  prepared.stagedImports = stagedImports;
  return stagedImports;
}

export function readApkAssets(apk, prepared, entries) {
  return verifyPackagedAssets({
    ...prepared, entries,
    readEntry: entry => {
      const result = spawnSync('unzip', ['-p', apk, entry], {
        timeout: 60000, maxBuffer: 32 * 1024 * 1024,
      });
      assert.ok(!result.error && result.status === 0, 'PACKAGED_ASSET_READ_FAILED: ' + entry);
      return result.stdout;
    },
  });
}
