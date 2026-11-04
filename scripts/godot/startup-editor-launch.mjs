// Real fresh-editor negative control. Invalid viewport prevents all auth/network
// startup before the first login call. This is not production/world evidence.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { prepareCaptureProject } from './startup-capture-contract.mjs';
const directory = await mkdtemp(join(tmpdir(), 'aurion-startup-editor-test-'));
let editor;
try {
  const project = await prepareCaptureProject(resolve('godot-client'), join(directory, 'project'));
  editor = spawn(resolve(process.argv[2]), ['--editor', '--path', project, '--rendering-method', 'gl_compatibility', '--audio-driver', 'Dummy'], {
    detached:true, stdio:'ignore', env:{...process.env,AURION_PARITY_NONCE:'a'.repeat(32),AURION_PARITY_PRIVATE_DIR:directory,AURION_PARITY_VIEWPORT:'invalid'},
  });
  let spawnError = false; editor.on('error', () => { spawnError = true; });
  let observed = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    assert.equal(spawnError, false, 'editor spawn failed');
    assert.equal(editor.exitCode, null, 'editor exited before game launch');
    try {
      const started = JSON.parse(await readFile(join(directory,'editor-start.json'),'utf8'));
      const state = JSON.parse(await readFile(join(directory,'godot-state.json'),'utf8'));
      assert.equal(started.pid, editor.pid);
      assert.equal(started.editor,true);
      assert.equal(started.scene,'res://addons/aurion_bridge/authoring_entry.tscn');
      assert.equal(state.failure,'GODOT_VIEWPORT_NOT_CONFIGURED');
      observed = true;
      break;
    } catch(error) { if(error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve,100));
  }
  assert.equal(observed,true,'fresh editor did not launch the real authoring game');
  console.log('STARTUP_EDITOR_REAL_GAME_LAUNCH_PASS_NO_AUTH');
} finally {
  if(editor?.pid) { try { process.kill(-editor.pid,'SIGTERM'); } catch {} await new Promise(resolve=>setTimeout(resolve,500)); try { process.kill(-editor.pid,'SIGKILL'); } catch {} }
  await rm(directory,{recursive:true,force:true});
}
