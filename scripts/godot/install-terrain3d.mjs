#!/usr/bin/env node
// Official Terrain3D native release. Never accept unpinned build dependencies.
import { mkdtemp, mkdir, readFile, rm, cp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const NAME = 'Terrain3D_v1.0.2-stable.zip';
const URL = 'https://github.com/TokisanGames/Terrain3D/releases/download/v1.0.2-stable/' + NAME;
const SHA256 = 'a071850250ec5e596aa54da61c01d75768774eb379ee997584d426a45f4884a2';
const target = resolve('godot-client/addons/terrain_3d');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(command + ' failed: ' + (result.stderr || result.stdout || result.error));
  return result.stdout;
}

const work = await mkdtemp(join(tmpdir(), 'aurion-terrain3d-'));
try {
  const zip = join(work, NAME);
  run('curl', ['--fail', '--location', '--retry', '2', '--connect-timeout', '15', '--max-time', '180', '--silent', '--show-error', '--output', zip, URL]);
  const file = await readFile(zip);
  const actual = createHash('sha256').update(file).digest('hex');
  if (actual !== SHA256) throw new Error('Terrain3D ZIP SHA256 mismatch: expected ' + SHA256 + ', received ' + actual);
  const names = run('unzip', ['-Z1', zip]).split('\n').filter(Boolean);
  for (const name of names) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || posix.normalize(name).startsWith('../')) {
      throw new Error('Unsafe Terrain3D archive entry');
    }
  }
  const anchors = [...new Set(names.filter(n => n.endsWith('addons/terrain_3d/terrain.gdextension')).map(n => n.slice(0, -'addons/terrain_3d/terrain.gdextension'.length)))];
  if (anchors.length !== 1) throw new Error('Expected exactly one Terrain3D addon root, got ' + anchors.length);
  const root = join(work, 'unpacked');
  run('unzip', ['-q', zip, '-d', root]);
  const from = join(root, anchors[0], 'addons', 'terrain_3d');
  await stat(join(from, 'terrain.gdextension'));
  await stat(join(from, 'bin', 'libterrain.android.release.arm64.so'));
  await stat(join(from, 'bin', 'libterrain.linux.release.x86_64.so'));
  await mkdir(resolve('godot-client/addons'), { recursive: true });
  await cp(from, target, { recursive: true, force: false, errorOnExist: true });
  console.log('TERRAIN3D_PINNED_VERIFIED version=v1.0.2-stable sha256=' + actual + ' android_arm64=present linux_x86_64=present');
} finally {
  await rm(work, { recursive: true, force: true });
}
