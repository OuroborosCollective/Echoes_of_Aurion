import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo, lock } from './toolchain.mjs';
import { treeDigest } from './android-toolchain.mjs';

async function isolated(fn) {
  const workspace = await mkdtemp(resolve(tmpdir(), 'aurion-doctor-'));
  try { await fn(workspace); } finally { await rm(workspace, { recursive: true, force: true }); }
}
function invoke(name, workspace) {
  return spawnSync(process.execPath, [resolve(repo, `scripts/godot/${name}.mjs`)], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, AURION_GODOT_WORKSPACE: workspace },
  });
}
test('fresh workspace is missing, not Android-ready', () => isolated(async workspace => {
  const result = invoke('doctor', workspace);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.editor, 'missing');
  assert.equal(report.android, 'missing');
}));
test('present but unreceipted binary fails closed', () => isolated(async workspace => {
  await mkdir(resolve(workspace, 'editor'));
  await writeFile(resolve(workspace, 'editor', lock.engine.file), 'corrupt');
  const result = invoke('doctor', workspace);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).editor, 'incompatible');
}));
test('concurrent bootstrap stops before download or extraction', () => isolated(async workspace => {
  await mkdir(resolve(workspace, 'bootstrap.lock'));
  const result = invoke('bootstrap', workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/);
}));
test('SDK receipt changes when an installed file is altered', () => isolated(async workspace => {
  await writeFile(resolve(workspace, 'sdk-file'), 'original');
  const first = await treeDigest(workspace);
  assert.equal(await treeDigest(workspace), first);
  await writeFile(resolve(workspace, 'sdk-file'), 'modified');
  assert.notEqual(await treeDigest(workspace), first);
}));
test('Android bootstrap respects the same exclusive workspace lock', () => isolated(async workspace => {
  await mkdir(resolve(workspace, 'bootstrap.lock'));
  const result = invoke('bootstrap-android', workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EEXIST/);
}));
