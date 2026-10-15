import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lock, root, executable, digest, run } from './toolchain.mjs';

if (`${process.platform}-${process.arch}` !== lock.host) throw new Error(`Unsupported host; expected ${lock.host}`);
await mkdir(root, { recursive: true });
// Exclusive lock prevents concurrent extraction and partial receipts.
const mutex = resolve(root, 'bootstrap.lock');
await mkdir(mutex);
try {
  let ready = false;
  try {
    const receipt = JSON.parse(await readFile(resolve(root, 'editor-receipt.json'), 'utf8'));
    ready = receipt.archiveSha256 === lock.engine.sha256 && receipt.binarySha256 === await digest(executable) && run(executable, ['--headless', '--version']) === lock.engine.version;
  } catch { /* A fresh or damaged workspace needs verified installation. */ }
  if (ready) console.log('Godot editor already verified; no changes');
  else {
    const archive = resolve(root, 'editor.zip');
    const partial = `${archive}.partial`;
    let cached = false;
    try { cached = (await stat(archive)).size === lock.engine.bytes && await digest(archive) === lock.engine.sha256; } catch { /* Missing cache. */ }
    if (!cached) {
      const response = await fetch(lock.engine.url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
      let received = 0;
      const bound = new Transform({ transform(chunk, encoding, callback) {
        received += chunk.length;
        callback(received > lock.engine.bytes ? new Error('Download exceeds pinned size') : null, chunk);
      } });
      try {
        await pipeline(Readable.fromWeb(response.body), bound, createWriteStream(partial, { flags: 'w' }));
        if (received !== lock.engine.bytes || await digest(partial) !== lock.engine.sha256) throw new Error('Archive integrity mismatch');
        await rename(partial, archive);
      } finally { await rm(partial, { force: true }); }
    }
    const staging = resolve(root, 'editor-staging');
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging);
    // Only the pinned executable is extracted, never arbitrary archive paths.
    run('unzip', ['-oq', archive, lock.engine.file, '-d', staging]);
    const candidate = resolve(staging, lock.engine.file);
    if (run(candidate, ['--headless', '--version']) !== lock.engine.version) throw new Error('Engine version mismatch');
    const binarySha256 = await digest(candidate);
    await rm(resolve(root, 'editor'), { recursive: true, force: true });
    await rename(staging, resolve(root, 'editor'));
    await writeFile(resolve(root, 'editor-receipt.json'), JSON.stringify({ archiveSha256: lock.engine.sha256, binarySha256, version: lock.engine.version }, null, 2) + '\n');
    console.log('Godot editor installed and verified');
  }
} finally { await rm(mutex, { recursive: true, force: true }); }
