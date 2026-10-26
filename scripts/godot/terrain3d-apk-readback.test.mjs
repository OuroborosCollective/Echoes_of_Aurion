import assert from 'node:assert/strict';
import test from 'node:test';
import { TERRAIN3D_ANDROID_ARM64_ENTRY, verifyTerrain3dApkBytes } from './terrain3d-apk-readback.mjs';

test('Terrain3D APK readback requires and hashes the exact ARM64 native library', () => {
  const sourceBytes = Buffer.from('pinned Terrain3D ARM64 library');
  const result = verifyTerrain3dApkBytes({
    sourceBytes,
    entries: [TERRAIN3D_ANDROID_ARM64_ENTRY],
    readEntry: entry => {
      assert.equal(entry, TERRAIN3D_ANDROID_ARM64_ENTRY);
      return Buffer.from(sourceBytes);
    },
  });
  assert.equal(result.abi, 'arm64-v8a');
  assert.equal(result.bytes, sourceBytes.length);
  assert.equal(result.sourceSha256, result.packagedSha256);
  assert.equal(result.device, 'unverified');
});

test('Terrain3D APK readback rejects a missing ARM64 library', () => {
  assert.throws(() => verifyTerrain3dApkBytes({
    sourceBytes: Buffer.from('library'),
    entries: [],
    readEntry: () => Buffer.from('library'),
  }), /TERRAIN3D_ANDROID_ARM64_LIBRARY_NOT_PACKAGED/);
});

test('Terrain3D APK readback rejects different packaged bytes', () => {
  assert.throws(() => verifyTerrain3dApkBytes({
    sourceBytes: Buffer.from('source'),
    entries: [TERRAIN3D_ANDROID_ARM64_ENTRY],
    readEntry: () => Buffer.from('other'),
  }), /TERRAIN3D_PACKAGED_LIBRARY_CHANGED/);
});

