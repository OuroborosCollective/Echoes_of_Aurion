#!/usr/bin/env node
/** Load the optional documentation dock in an isolated temporary Godot project. */
import assert from 'node:assert/strict';
import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const [editor, sourceProject] = process.argv.slice(2);
assert.ok(editor && sourceProject, 'usage: knowledge-helper-editor-smoke.mjs <godot-editor> <godot-project>');
const project = await mkdtemp(join(tmpdir(), 'aurion-knowledge-helper-editor-'));
try {
  const addonSource = join(resolve(sourceProject), 'addons', 'aurion_knowledge_helper');
  const addonTarget = join(project, 'addons', 'aurion_knowledge_helper');
  await mkdir(join(project, 'addons'), {recursive: true});
  await cp(addonSource, addonTarget, {recursive: true, errorOnExist: true});
  await writeFile(join(project, 'project.godot'), [
    'config_version=5',
    '',
    '[application]',
    'config/name="Aurion Knowledge Helper Smoke"',
    '',
    '[editor_plugins]',
    'enabled=PackedStringArray("res://addons/aurion_knowledge_helper/plugin.cfg")',
    '',
  ].join('\n'));
  const result = spawnSync(resolve(editor), [
    '--headless',
    '--path', project,
    '--editor',
    '--import',
    '--quit',
  ], {
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, AURION_KNOWLEDGE_HELPER_EDITOR_SMOKE: '1'},
  });
  const output = String(result.stdout || '') + '\n' + String(result.stderr || '');
  assert.equal(result.error, undefined, result.error?.message || 'GODOT_EDITOR_SPAWN_FAILED');
  assert.equal(result.status, 0, 'GODOT_EDITOR_SMOKE_FAILED\n' + output);
  assert.match(output, /AURION_KNOWLEDGE_HELPER_EDITOR_PASS/, 'documentation dock did not enter the editor tree');
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|(?:^|\s)ERROR:/m, 'Godot emitted an error during plugin activation');
  console.log('AURION_KNOWLEDGE_HELPER_EDITOR_PASS');
} finally {
  await rm(project, {recursive: true, force: true});
}
