import assert from 'node:assert/strict';
import test from 'node:test';
import { TERRAIN3D_ANDROID_ARM64_ENTRIES, verifyTerrain3dApkBytes } from './terrain3d-apk-readback.mjs';

test('debug preview APK readback hashes the exact ARM64 native library', () => {
  const sourceBytes = Buffer.from('pinned Terrain3D debug ARM64 library');
  const result = verifyTerrain3dApkBytes({
    sourceBytes,
    entries: [TERRAIN3D_ANDROID_ARM64_ENTRIES.debug],
    readEntry: entry => {
      assert.equal(entry, TERRAIN3D_ANDROID_ARM64_ENTRIES.debug);
      return Buffer.from(sourceBytes);
    },
  });
  assert.equal(result.flavor, 'debug');
  assert.equal(result.abi, 'arm64-v8a');
  assert.equal(result.bytes, sourceBytes.length);
  assert.equal(result.sourceSha256, result.packagedSha256);
  assert.equal(result.device, 'unverified');
});

test('release APK readback selects the release library', () => {
  const sourceBytes = Buffer.from('pinned Terrain3D release ARM64 library');
  const result = verifyTerrain3dApkBytes({
    sourceBytes,
    entries: [TERRAIN3D_ANDROID_ARM64_ENTRIES.release],
    flavor: 'release',
    readEntry: entry => {
      assert.equal(entry, TERRAIN3D_ANDROID_ARM64_ENTRIES.release);
      return Buffer.from(sourceBytes);
    },
  });
  assert.equal(result.flavor, 'release');
  assert.equal(result.library, TERRAIN3D_ANDROID_ARM64_ENTRIES.release);
});

test('Terrain3D APK readback rejects a missing build variant', () => {
  assert.throws(() => verifyTerrain3dApkBytes({
    sourceBytes: Buffer.from('library'),
    entries: [],
    readEntry: () => Buffer.from('library'),
  }), /TERRAIN3D_ANDROID_ARM64_LIBRARY_NOT_PACKAGED \(debug\)/);
});

test('Terrain3D APK readback rejects different packaged bytes', () => {
  assert.throws(() => verifyTerrain3dApkBytes({
    sourceBytes: Buffer.from('source'),
    entries: [TERRAIN3D_ANDROID_ARM64_ENTRIES.debug],
    readEntry: () => Buffer.from('other'),
  }), /TERRAIN3D_PACKAGED_LIBRARY_CHANGED/);
});

