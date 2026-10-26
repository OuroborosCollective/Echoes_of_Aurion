import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

export const TERRAIN3D_ANDROID_ARM64_ENTRY = 'lib/arm64-v8a/libterrain.android.release.arm64.so';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Require the exact pinned Terrain3D ARM64 library in the exported APK. */
export function verifyTerrain3dApkBytes({ sourceBytes, entries, readEntry }) {
  assert.ok(Buffer.isBuffer(sourceBytes) && sourceBytes.length > 0, 'TERRAIN3D_SOURCE_LIBRARY_MISSING');
  assert.ok(entries.includes(TERRAIN3D_ANDROID_ARM64_ENTRY), 'TERRAIN3D_ANDROID_ARM64_LIBRARY_NOT_PACKAGED');
  const packagedBytes = readEntry(TERRAIN3D_ANDROID_ARM64_ENTRY);
  assert.ok(Buffer.isBuffer(packagedBytes) && packagedBytes.length > 0, 'TERRAIN3D_PACKAGED_LIBRARY_UNREADABLE');
  const sourceSha256 = sha256(sourceBytes);
  const packagedSha256 = sha256(packagedBytes);
  assert.equal(packagedSha256, sourceSha256, 'TERRAIN3D_PACKAGED_LIBRARY_CHANGED');
  return {
    library: TERRAIN3D_ANDROID_ARM64_ENTRY,
    abi: 'arm64-v8a',
    bytes: packagedBytes.length,
    sourceSha256,
    packagedSha256,
    layer: 'android-apk-native-library-byte-readback',
    device: 'unverified',
  };
}

export async function readTerrain3dApk(apkPath, stagedTerrain3D, entries) {
  const sourceBytes = await readFile(stagedTerrain3D.androidLibraryPath);
  const result = verifyTerrain3dApkBytes({
    sourceBytes,
    entries,
    readEntry: entry => {
      const result = spawnSync('unzip', ['-p', apkPath, entry], {
        timeout: 60000,
        maxBuffer: 32 * 1024 * 1024,
      });
      assert.ok(!result.error && result.status === 0, 'TERRAIN3D_APK_LIBRARY_READ_FAILED: ' + entry);
      return result.stdout;
    },
  });
  assert.equal(result.sourceSha256, stagedTerrain3D.androidLibrarySha256, 'TERRAIN3D_STAGED_LIBRARY_CHANGED');
  return {
    ...result,
    archiveVersion: 'v1.0.2-stable',
    archiveSha256: stagedTerrain3D.archiveSha256,
  };
}

