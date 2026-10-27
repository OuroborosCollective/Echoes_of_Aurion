import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = join(dirname(fileURLToPath(import.meta.url)), 'build-offline-linux-pack.sh');
const engineName = 'Godot_v4.7.2-stable_linux.x86_64';
const engineVersion = '4.7.2.stable.official.ed1daf0bf';
const hash = input => createHash('sha256').update(input).digest('hex');
function run(cwd, command, args = [], options = {}) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', ...options });
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
  put('config/godot-toolchain.lock.json', JSON.stringify({engine:{file:engineName,version:engineVersion,sha256:'a'.repeat(64)}}));
  const executable = put('.aurion-godot/editor/' + engineName, '#!/bin/sh\n[ "$1" = "--headless" ] && [ "$2" = "--version" ] && { echo 4.7.2.stable.official.ed1daf0bf; exit 0; }\nexit 2\n');
  chmodSync(executable, 0o755);
  put('.aurion-godot/editor-receipt.json', JSON.stringify({archiveSha256:'a'.repeat(64),binarySha256:hash(readFileSync(executable)),version:engineVersion}));
  cpSync(script, put('scripts/godot/build-offline-linux-pack.sh', ''), { force:true });
  put('.gitignore', '/.aurion-godot/\n/godot-client/addons/modular_character_system/\n/out/\n');
  checked(dir, 'git', ['init', '-q']);
  checked(dir, 'git', ['config', 'user.name', 'Fixture']);
  checked(dir, 'git', ['config', 'user.email', 'fixture@example.invalid']);
  checked(dir, 'git', ['add', 'config', 'godot-client', 'scripts', '.gitignore']);
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
    assert.equal(checked(out, 'sha256sum', ['--check', 'SHA256SUMS']).split('\n').filter(x => x.endsWith('OK')).length, 5);
    const names = checked(out, 'bash', ['-c', 'zstd -dc aurion-godot-project.tar.zst | tar -tf -']);
    assert.match(names, /godot-client\/project\.godot/);
    assert.match(names, /godot-client\/addons\/virtual_joystick\/plugin\.cfg/);
    assert.match(names, /scripts\/godot\/check\.sh/);
    assert.match(names, /config\/godot-toolchain\.lock\.json/);
    assert.doesNotMatch(names, /modular_character_system|PAID_VENDOR|\.godot\//);
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
