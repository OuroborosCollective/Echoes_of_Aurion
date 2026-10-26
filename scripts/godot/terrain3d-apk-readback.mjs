import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export const TERRAIN3D_ANDROID_ARM64_ENTRIES = Object.freeze({
  debug: 'lib/arm64-v8a/libterrain.android.debug.arm64.so',
  release: 'lib/arm64-v8a/libterrain.android.release.arm64.so',
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Require the exact Terrain3D ARM64 build variant and bytes in the exported APK. */
export function verifyTerrain3dApkBytes({ sourceBytes, entries, readEntry, flavor = 'debug' }) {
  assert.ok(Buffer.isBuffer(sourceBytes) && sourceBytes.length > 0, 'TERRAIN3D_SOURCE_LIBRARY_MISSING');
  const expectedEntry = TERRAIN3D_ANDROID_ARM64_ENTRIES[flavor];
  assert.ok(Object.hasOwn(TERRAIN3D_ANDROID_ARM64_ENTRIES, flavor), 'TERRAIN3D_BUILD_FLAVOR_INVALID');
  const terrainLibraries = entries.filter(entry => /libterrain\.android\.(?:debug|release)\.arm64\.so$/i.test(entry));
  assert.ok(
    entries.includes(expectedEntry),
    'TERRAIN3D_ANDROID_ARM64_LIBRARY_NOT_PACKAGED (' + flavor + '): ' + JSON.stringify(terrainLibraries),
  );
  const packagedBytes = readEntry(expectedEntry);
  assert.ok(Buffer.isBuffer(packagedBytes) && packagedBytes.length > 0, 'TERRAIN3D_PACKAGED_LIBRARY_UNREADABLE');
  const sourceSha256 = sha256(sourceBytes);
  const packagedSha256 = sha256(packagedBytes);
  assert.equal(packagedSha256, sourceSha256, 'TERRAIN3D_PACKAGED_LIBRARY_CHANGED');
  return {
    library: expectedEntry,
    flavor,
    abi: 'arm64-v8a',
    bytes: packagedBytes.length,
    sourceSha256,
    packagedSha256,
    layer: 'android-apk-native-library-byte-readback',
    device: 'unverified',
  };
}

export async function readTerrain3dApk(apkPath, stagedTerrain3D, entries, flavor = 'debug') {
  const sourcePath = flavor === 'debug'
    ? stagedTerrain3D.androidDebugLibraryPath
    : stagedTerrain3D.androidReleaseLibraryPath;
  const expectedSha256 = flavor === 'debug'
    ? stagedTerrain3D.androidDebugLibrarySha256
    : stagedTerrain3D.androidReleaseLibrarySha256;
  assert.ok(sourcePath && expectedSha256, 'TERRAIN3D_STAGED_BUILD_FLAVOR_MISSING: ' + flavor);
  const sourceBytes = await readFile(sourcePath);
  const result = verifyTerrain3dApkBytes({
    sourceBytes,
    entries,
    flavor,
    readEntry: entry => {
      const process = spawnSync('unzip', ['-p', apkPath, entry], {
        timeout: 60000,
        maxBuffer: 32 * 1024 * 1024,
      });
      assert.ok(!process.error && process.status === 0, 'TERRAIN3D_APK_LIBRARY_READ_FAILED: ' + entry);
      return process.stdout;
    },
  });
  assert.equal(result.sourceSha256, expectedSha256, 'TERRAIN3D_STAGED_LIBRARY_CHANGED');
  return {
    ...result,
    archiveVersion: 'v1.0.2-stable',
    archiveSha256: stagedTerrain3D.archiveSha256,
  };
}
