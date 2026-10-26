import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { repo } from './toolchain.mjs';
import { join } from 'node:path';

// Real committed binary source vs byte-identical new Godot binary.
// No screenshot, shader name or manifest alone can pass this test.
const web = join(repo, 'client/src/xaurion/world/assets');
const native = join(repo, 'godot-client/assets/world');
const [source, copied, metadata, nativeMetadata] = await Promise.all([
  readFile(join(web, 'aurion-surface-atlas.webp')),
  readFile(join(native, 'aurion-surface-atlas.webp')),
  readFile(join(web, 'aurion-surface-atlas.json'), 'utf8'),
  readFile(join(native, 'aurion-surface-atlas.json'), 'utf8'),
]);
assert.deepEqual(copied, source, 'native atlas must match source bytes exactly');
assert.equal(nativeMetadata, metadata, 'native metadata must be copied byte-exactly');
const parsed = JSON.parse(metadata);
const sha256 = createHash('sha256').update(source).digest('hex');
assert.equal(source.length, parsed.bytes, 'binary byte length mismatch');
assert.equal(sha256, parsed.sha256, 'binary differs from declared SHA256');
assert.equal(source.toString('ascii', 0, 4), 'RIFF', 'not RIFF container');
assert.equal(source.toString('ascii', 8, 12), 'WEBP', 'not WebP');
assert.equal(parsed.width, 1024);
assert.equal(parsed.height, 1024);
assert.deepEqual(parsed.quadrants, ['paving', 'forest', 'wood', 'rock']);
assert.deepEqual(parsed.maps, ['baseColor']);
assert.equal(parsed.runtimeTileSize, 512);
assert.equal(parsed.colorSpace, 'sRGB');
console.log('G17 real source WebP SHA256 and exact-copy provenance verified:', sha256);
