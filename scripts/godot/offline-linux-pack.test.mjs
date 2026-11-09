import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fetchPinnedArchiveWithRetry } from './download-pinned-editor.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'build-offline-linux-pack.sh');
const engineName = 'Godot_v4.7.2-stable_linux.x86_64';
const engineVersion = '4.7.2.stable.official.ed1daf0bf';
const hash = input => createHash('sha256').update(input).digest('hex');
function run(cwd, command, args = [], options = {}) {
  // Nested fixture has its own HEAD; do not inherit outer CI revision.
  return spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, AURION_RELEASE_SHA: '' }, ...options });
}
function checked(cwd, command, args = []) {
  const r = run(cwd, command, args);
  assert.equal(r.status, 0, command + ' ' + args.join(' ') + ': ' + (r.stderr || r.stdout));
  return r.stdout.trim();
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'aurion-godot-package-test-'));
  const put = (name, content) => { const path = join(dir, name); mkdirSync(dirname(path), { recursive:true }); writeFileSync(path, content); return path; };
  put('godot-client/project.godot', 'config_version=5\n[application]\nconfig/name="Aurion"\n');
  put('godot-client/addons/virtual_joystick/plugin.cfg', '[plugin]\nname="joystick"\n');
  put('godot-client/actors/fake.gd', 'extends Node3D\n');
  put('scripts/godot/check.sh', '#!/bin/sh\n');
  put('shared/worldChunkCoordinates.ts', 'export const WORLD_CHUNK_SIZE_MM = 64000;\n');
  put('scripts/godot/THIRD_PARTY_GODOT_LICENSE.txt', 'Copyright (c) Godot Engine contributors.\n');
  put('config/godot-toolchain.lock.json', JSON.stringify({engine:{file:engineName,version:engineVersion,sha256:'a'.repeat(64)}}));
  const executable = put('.aurion-godot/editor/' + engineName, '#!/bin/sh\n[ "$1" = "--headless" ] && [ "$2" = "--version" ] && { echo 4.7.2.stable.official.ed1daf0bf; exit 0; }\nexit 2\n');
  chmodSync(executable, 0o755);
  put('.aurion-godot/editor-receipt.json', JSON.stringify({archiveSha256:'a'.repeat(64),binarySha256:hash(readFileSync(executable)),version:engineVersion}));
  cpSync(script, put('scripts/godot/build-offline-linux-pack.sh', ''), { force:true });
  put('.gitignore', '/.aurion-godot/\n/godot-client/addons/modular_character_system/\n/out/\n');
  checked(dir, 'git', ['init', '-q']);
  checked(dir, 'git', ['config', 'user.name', 'Fixture']);
  checked(dir, 'git', ['config', 'user.email', 'fixture@example.invalid']);
  checked(dir, 'git', ['add', 'config', 'godot-client', 'scripts', 'shared', '.gitignore']);
  checked(dir, 'git', ['commit', '-qm', 'fixture']);
  put('godot-client/addons/modular_character_system/PAID_VENDOR.gd', 'PRIVATE LICENSED SOURCE\n');
  return { dir, put };
}

test('manual Linux pack is importable, includes pinned editor, excludes private add-ons, hashes payload', () => {
  const {dir} = fixture();
  try {
    const r = run(dir, 'bash', [script, 'out/godot-linux']);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = join(dir, 'out/godot-linux');
    assert.equal(checked(out, 'sha256sum', ['--check', 'SHA256SUMS']).split('\n').filter(x => x.endsWith('OK')).length, 6);
    const names = checked(out, 'bash', ['-c', 'zstd -dc aurion-godot-project.tar.zst | tar -tf -']);
    assert.match(names, /godot-client\/project\.godot/);
    assert.match(names, /godot-client\/addons\/virtual_joystick\/plugin\.cfg/);
    assert.match(names, /scripts\/godot\/check\.sh/);
    assert.match(names, /config\/godot-toolchain\.lock\.json/);
    assert.match(names, /shared\/worldChunkCoordinates\.ts/);
    assert.doesNotMatch(names, /modular_character_system|PAID_VENDOR|\.godot\//);
    assert.match(readFileSync(join(out,'LICENSE-Godot-4.7.2.txt'), 'utf8'), /Godot Engine contributors/);
    const source = JSON.parse(readFileSync(join(out,'manifest.json'), 'utf8'));
    assert.equal(source.sourceRevision, checked(dir, 'git', ['rev-parse', 'HEAD']));
    assert.equal(source.engineVersion, engineVersion);
    assert.equal(source.licensedAddonsBundled, false);
    assert.equal(source.projectPath, 'godot-client/project.godot');
    const unpacked = checked(out, 'bash', ['-c', 'zstd -dc ' + engineName + '.zst | sha256sum']).split(' ')[0];
    assert.equal(unpacked, source.engineBinarySha256);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('fail closed if any purchased vendor file is committed', () => {
  const {dir} = fixture();
  try {
    checked(dir, 'git', ['add', '-f', 'godot-client/addons/modular_character_system/PAID_VENDOR.gd']);
    checked(dir, 'git', ['commit', '-qm', 'vendor leaked']);
    const r = run(dir, 'bash', [script, 'out/godot-linux']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /licensed|private|vendor/i);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('fail closed on altered editor binary / mismatching receipt', () => {
  const {dir,put} = fixture();
  try {
    put('.aurion-godot/editor/' + engineName, 'tampered');
    const r = run(dir, 'bash', [script, 'out/godot-linux']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /checksum|sha|receipt|editor|version/i);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('fail closed on explicitly requested wrong source revision', () => {
  const {dir} = fixture();
  try {
    const r = run(dir, 'bash', [script, 'out/godot-linux'], {env: { ...process.env, AURION_RELEASE_SHA: 'f'.repeat(40) }});
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /Git SHA does not match/);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('fail closed if the shared coordinate dependency was modified', () => {
  const {dir,put} = fixture();
  try {
    put('shared/worldChunkCoordinates.ts', 'export const WORLD_CHUNK_SIZE_MM = 1;\n');
    const r = run(dir, 'bash', [script, 'out/godot-linux']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /dirty source files/);
  } finally { rmSync(dir, { recursive:true, force:true }); }
});

test('pinned Godot download retries only temporary HTTP errors with a bounded delay', async () => {
  let count = 0;
  const delays = [];
  const valid = { ok: true, status: 200, body: {} };
  const result = await fetchPinnedArchiveWithRetry('https://example.invalid/pinned-editor.zip', {
    fetcher: async () => (++count < 3 ? { ok: false, status: 504 } : valid),
    pause: async ms => delays.push(ms),
  });
  assert.equal(result, valid);
  assert.equal(count, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('pinned Godot download fails closed after repeated HTTP 503', async () => {
  let calls = 0;
  await assert.rejects(
    fetchPinnedArchiveWithRetry('https://example.invalid/pinned-editor.zip', {
      fetcher: async () => { calls++; return { ok: false, status: 503 }; },
      pause: async () => {},
    }),
    /Download failed: 503/,
  );
  assert.equal(calls, 4);
});

test('pinned Godot download does not retry permanent 404 or empty successful response', async () => {
  let calls = 0;
  await assert.rejects(
    fetchPinnedArchiveWithRetry('https://example.invalid/pinned-editor.zip', {
      fetcher: async () => { calls++; return { ok: false, status: 404 }; },
      pause: async () => {},
    }),
    /Download failed: 404/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    fetchPinnedArchiveWithRetry('https://example.invalid/pinned-editor.zip', {
      fetcher: async () => ({ ok: true, status: 200, body: null }),
      pause: async () => {},
    }),
    /Download failed: 200/,
  );
});

test('Terrain3D independent download is bounded and keeps mandatory pinned archive integrity', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'install-terrain3d.mjs'), 'utf8');
  for (const token of ["'--retry', '6'", "'--retry-all-errors'", "'--retry-max-time', '240'"]) {
    assert.ok(source.includes(token), "Terrain3D failed HTTP retrieval must use bounded retries: " + token);
  }
  assert.ok(source.includes("actual !== SHA256"), 'Terrain3D native archive SHA256 verification must not be weakened');
  assert.ok(source.includes("Unsafe Terrain3D archive entry"), 'ZIP traversal guard must remain');
});
