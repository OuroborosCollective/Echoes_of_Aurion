import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
import { includeAssetManifest, verifyPackagedAssets } from './export-assets.mjs';

function fixture() {
  const hash = 'a'.repeat(64), assetId = 'glb_' + hash.slice(0, 48);
  const manifest = {
    schemaVersion: 'aurion.godot-prepared-assets.v1',
    outputMode: 'byte-exact-compatible-copy',
    sourceRevision: 'b'.repeat(40), toolchainHash: 'c'.repeat(64),
    sources: [{
      assetId, sha256: hash, sourceSha256: hash, outputSha256: hash,
      path: 'godot-client/assets/generated/' + assetId + '.glb',
    }],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + '\n');
  const remapEntry = 'assets/assets/generated/' + assetId + '.glb.remap';
  const importedEntry = 'assets/.godot/imported/' + assetId + '.glb-deadbeef.scn';
  const files = new Map([
    ['assets/assets/generated/manifest.json', manifestBytes],
    [remapEntry, Buffer.from('[remap]\n\npath="res://.godot/imported/' + assetId + '.glb-deadbeef.scn"\n')],
    [importedEntry, Buffer.concat([Buffer.from('RSCC'), Buffer.alloc(64)])],
  ]);
  const stagedImports = {
    schemaVersion: 'aurion.godot-staged-imports.v1', sourceRevision: manifest.sourceRevision,
    manifestSha256: sha256(manifestBytes), failures: [],
    records: [{ assetId, importedPath: 'res://' + importedEntry.slice('assets/'.length), importedSha256: sha256(files.get(importedEntry)) }],
  };
  return { manifest, manifestBytes, stagedImports, files, remapEntry, importedEntry };
}
function verify(value) {
  return verifyPackagedAssets({
    manifest: value.manifest, manifestBytes: value.manifestBytes, stagedImports: value.stagedImports,
    entries: [...value.files.keys()],
    readEntry: entry => { assert.ok(value.files.has(entry)); return value.files.get(entry); },
  });
}
test('both presets explicitly package generated manifest JSON', () => {
  const text = '[preset.0]\ninclude_filter="net/contracts/*.json,override.cfg"\n[preset.1]\ninclude_filter="net/contracts/*.json,override.cfg"\n';
  const updated = includeAssetManifest(text);
  assert.equal(updated.match(/assets\/generated\/manifest.json/g).length, 2);
  assert.throws(() => includeAssetManifest(updated), /EXPORT_INCLUDE_FILTER_CHANGED/);
});
test('package receipt hashes actual imported bytes and preserves source identity separately', () => {
  const value = fixture(), receipt = verify(value);
  assert.equal(receipt.sourceRevision, value.manifest.sourceRevision);
  assert.equal(receipt.resources.length, 1);
  assert.equal(receipt.resources[0].importedBytes, 68);
  assert.match(receipt.resources[0].importedSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(receipt.resources[0].importedSha256, receipt.resources[0].sourceSha256);
  assert.equal(receipt.device, 'unverified');
});
test('missing, stale, broken and aliased APK models fail at the intended boundary', () => {
  const cases = [
    [v => v.files.delete('assets/assets/generated/manifest.json'), /PACKAGED_ASSET_MANIFEST_MISSING/],
    [v => v.files.set('assets/assets/generated/manifest.json', Buffer.from('{}')), /PACKAGED_ASSET_MANIFEST_CHANGED/],
    [v => v.files.delete(v.remapEntry), /PACKAGED_ASSET_REMAP_MISSING/],
    [v => v.files.delete(v.importedEntry), /PACKAGED_IMPORTED_SCENE_MISSING/],
    [v => v.files.set(v.importedEntry, Buffer.alloc(0)), /PACKAGED_IMPORTED_SCENE_CHANGED/],
    [v => v.files.set(v.importedEntry, Buffer.concat([Buffer.from('RSCC'), Buffer.alloc(64, 1)])), /PACKAGED_IMPORTED_SCENE_CHANGED/],
    [v => v.files.set(v.remapEntry, Buffer.from('[remap]\npath="res://../outside.scn"\n')), /PACKAGED_ASSET_REMAP_INVALID/],
    [v => v.files.set(v.remapEntry, Buffer.from('[remap]\npath="https://example.com/model.scn"\n')), /PACKAGED_ASSET_REMAP_INVALID/],
    [v => {
      const other = 'assets/.godot/imported/other-model.scn';
      v.files.set(other, v.files.get(v.importedEntry));
      v.files.set(v.remapEntry, Buffer.from('[remap]\npath="res://' + other.slice(7) + '"\n'));
    }, /PACKAGED_ASSET_REMAP_CHANGED/],
    [v => {
      v.manifest.sources[0].path = '../outside.glb';
      refreshManifest(v);
    }, /PACKAGED_ASSET_PATH/],
    [v => {
      v.manifest.sources.push({ ...v.manifest.sources[0] });
      v.stagedImports.records.push({ ...v.stagedImports.records[0] });
      refreshManifest(v);
    }, /STAGED_IMPORT_IDENTITY|DUPLICATE_PACKAGED_ASSET/],
  ];
  for (const [mutate, expected] of cases) {
    const value = fixture(); mutate(value);
    assert.throws(() => verify(value), expected);
  }
});
function refreshManifest(value) {
  value.manifestBytes = Buffer.from(JSON.stringify(value.manifest) + '\n');
  value.files.set('assets/assets/generated/manifest.json', value.manifestBytes);
  value.stagedImports.manifestSha256 = sha256(value.manifestBytes);
}
