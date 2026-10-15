import { mkdir, mkdtemp, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lock, root, digest, run } from './toolchain.mjs';
import { androidReport, treeDigest } from './android-toolchain.mjs';

if (`${process.platform}-${process.arch}` !== lock.host) throw new Error('Unsupported Android build host');
if (!lock.android.packages?.length) throw new Error('Android packages not pinned');
await mkdir(root, { recursive: true });
const mutex = resolve(root, 'bootstrap.lock');
await mkdir(mutex);
try {
  if ((await androidReport()).status === 'ready') console.log('Android toolchain already verified; no changes');
  else {
    const staging = await mkdtemp(resolve(root, 'android-install-'));
    const cache = resolve(root, 'downloads');
    await mkdir(cache, { recursive: true });
    for (const item of lock.android.packages) {
      const archive = resolve(cache, `${item.sha256}.${item.format === 'zip' ? 'zip' : 'tar.gz'}`);
      let cached = false;
      try { cached = (await stat(archive)).size === item.bytes && await digest(archive) === item.sha256; } catch { /* Missing cache. */ }
      if (!cached) {
        const response = await fetch(item.url, { signal: AbortSignal.timeout(300000) });
        if (!response.ok || !response.body) throw new Error(`Download ${item.id}: HTTP ${response.status}`);
        const partial = `${archive}.partial`;
        let size = 0;
        const bound = new Transform({ transform(chunk, encoding, callback) {
          size += chunk.length;
          callback(size > item.bytes ? new Error('Download exceeds pinned size') : null, chunk);
        } });
        try {
          await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(partial));
          if (size !== item.bytes || await digest(partial) !== item.sha256) throw new Error(`Integrity mismatch: ${item.id}`);
          await rename(partial, archive);
        } finally { await rm(partial, { force: true }); }
      }
      const unpack = await mkdtemp(resolve(root, 'unpack-'));
      const entries = run(item.format === 'zip' ? 'unzip' : 'tar', item.format === 'zip' ? ['-Z1', archive] : ['-tzf', archive], 120000).split('\n');
      if (entries.some(p => p.startsWith('/') || p.split('/').includes('..') || p.includes('\\'))) throw new Error('Unsafe archive path');
      run(item.format === 'zip' ? 'unzip' : 'tar', item.format === 'zip' ? ['-oq', archive, '-d', unpack] : ['-xzf', archive, '-C', unpack], 120000);
      const target = resolve(staging, item.destination);
      await mkdir(resolve(target, '..'), { recursive: true });
      await rename(resolve(unpack, item.directory), target);
      await rm(unpack, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      console.log(`Installed ${item.id}`);
    }
    // SDK license acknowledgement is performed by the authorized build operator via sdkmanager,
    // never fabricated as a license file by this installer.
    const receipt = {
      installation: basename(staging),
      lockSha256: createHash('sha256').update(JSON.stringify(lock.android.packages)).digest('hex'),
      treeSha256: await treeDigest(staging),
    };
    await writeFile(resolve(root, 'android-receipt.json.pending'), JSON.stringify(receipt, null, 2) + '\n');
    await rename(resolve(root, 'android-receipt.json.pending'), resolve(root, 'android-receipt.json'));
    const report = await androidReport();
    if (report.status !== 'ready') throw new Error(JSON.stringify(report));
    console.log(JSON.stringify(report, null, 2));
  }
} finally { await rm(mutex, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
