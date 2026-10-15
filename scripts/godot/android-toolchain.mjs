import { createHash } from 'node:crypto';
import { readdir, readFile, readlink, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, lock, run } from './toolchain.mjs';

export async function treeDigest(directory) {
  const hash = createHash('sha256');
  async function visit(path, relative = '') {
    for (const entry of (await readdir(path)).sort()) {
      const child = resolve(path, entry), key = `${relative}/${entry}`, info = await lstat(child);
      hash.update(`${key}\0${info.mode}\0`);
      if (info.isSymbolicLink()) hash.update(await readlink(child));
      else if (info.isDirectory()) await visit(child, key);
      else if (info.isFile()) {
        // Bounded streaming for large SDK files.
        const { createReadStream } = await import('node:fs');
        for await (const chunk of createReadStream(child)) hash.update(chunk);
      } else throw new Error(`Unsupported SDK entry: ${key}`);
    }
  }
  await visit(directory);
  return hash.digest('hex');
}
export async function androidReport() {
  const report = { status: 'missing', scope: 'installed-tools', sdkLicenses: 'unverified', apkExport: 'unverified', gpu: 'unverified', device: 'unverified' };
  try {
    const receipt = JSON.parse(await readFile(resolve(root, 'android-receipt.json'), 'utf8'));
    report.status = 'incompatible';
    if (!/^android-install-[A-Za-z0-9]+$/.test(receipt.installation || '')) return report;
    const androidRoot = resolve(root, receipt.installation);
    const identity = createHash('sha256').update(JSON.stringify(lock.android.packages)).digest('hex');
    if (receipt.lockSha256 !== identity || receipt.treeSha256 !== await treeDigest(androidRoot)) return report;
    report.javac = run(resolve(androidRoot, 'jdk/bin/javac'), ['-version']);
    report.adb = run(resolve(androidRoot, 'sdk/platform-tools/adb'), ['version']);
    report.aapt = run(resolve(androidRoot, 'sdk/build-tools/35.0.1/aapt'), ['version']);
    if (!report.javac.includes('17.0.20')) return report;
    report.status = 'ready';
    report.lockSha256 = identity;
    report.treeSha256 = receipt.treeSha256;
    report.installation = androidRoot;
  } catch (error) { report.detail = error.message; }
  return report;
}
