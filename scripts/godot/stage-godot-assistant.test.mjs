import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_PIN, validateAssistantSource, hardenServiceProgram,
  hardenDock, hardenLauncher, enableAssistantInStagedProject,
  validateSourcePaths, validateEditorPolicy, assertSafeTarget, stageGodotAssistant,
} from './stage-godot-assistant.mjs';

const project = '[editor_plugins]\nenabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg")\n[application]\nconfig/name="Aurion"\n';
const dock = `mode.add_item("Ask before write")\n\tmode.add_item("Read only")\n\tmode.add_item("YOLO (agent + Godot)")\n\tmode.tooltip_text = "YOLO disables both the agent's native approvals and Godot Assistant's mutation prompts for this session."\n\tvar modes := ["AskBeforeWrite", "ReadOnly", "FullAuto"]`;
const launcher = `func launch(provider: String, mode: String) -> Dictionary:\n\tif not bridge.connected:\n\t\treturn {}\n\t_ensure_agent_instructions()\n\tvar command := _build_command(provider, str(check.path), session, mode)\n\t\t\t\t"FullAuto": return " --dangerously-skip-permissions"\n\t\t\t\t"FullAuto": return " --dangerously-bypass-approvals-and-sandbox"\n\t\t\t\t"FullAuto": return " --always-approve --permission-mode bypassPermissions"\n`;
const program = `if (!Enum.TryParse<PermissionMode>(request.Mode, true, out var mode)) mode = PermissionMode.AskBeforeWrite;\n            var session = bridge.CreateSession(request.ProviderId, mode);`;

test('upstream is exactly revision-pinned and editor-only', () => {
  assert.equal(ASSISTANT_PIN.commit, 'a6aed65584cf8cccd32a75e5a93e22b752a0b00a');
  assert.equal(ASSISTANT_PIN.version, '0.1.0');
  assert.equal(ASSISTANT_PIN.editorOnly, true);
});

test('source contract refuses drift or untrusted service build files', () => {
  const valid = {
    commit: ASSISTANT_PIN.commit,
    clean: true,
    pluginConfig: '[plugin]\nname="Godot Assistant"\nversion="0.1.0"\nscript="plugin.gd"',
    license: 'MIT License\nCopyright (c) 2026 Godot Assistant contributors',
    csproj: '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
  };
  assert.equal(validateAssistantSource(valid).commit, ASSISTANT_PIN.commit);
  assert.throws(() => validateAssistantSource({...valid, commit:'0'.repeat(40)}), /PIN_MISMATCH/);
  assert.throws(() => validateAssistantSource({...valid, clean:false}), /DIRTY/);
  assert.throws(() => validateAssistantSource({...valid, csproj:valid.csproj.replace('</Project>','<Exec Command="evil" /></Project>')}), /UNSAFE_CSPROJ/);
});

test('hardened relay rejects FullAuto and unrecognized mode before creating a session', () => {
  const out = hardenServiceProgram(program);
  assert.match(out, /AURION_FORBIDS_FULLAUTO/);
  assert.match(out, /PermissionMode\.ReadOnly/);
  assert.match(out, /PermissionMode\.AskBeforeWrite/);
  assert.match(out, /403/);
  assert.ok(out.indexOf('AURION_FORBIDS_FULLAUTO') < out.indexOf('bridge.CreateSession'));
  assert.throws(() => hardenServiceProgram('changed upstream implementation'), /SOURCE_DRIFT/);
});

test('editor UI removes bypass option and retains safe modes', () => {
  const out = hardenDock(dock);
  assert.doesNotMatch(out, /YOLO|FullAuto/);
  assert.match(out, /\["AskBeforeWrite", "ReadOnly"\]/);
  assert.match(out, /mode.add_item\("Ask before write"\)/);
  assert.throws(() => hardenDock('No expected controls'), /SOURCE_DRIFT/);
});

test('launcher rejects any mode outside the allowlist and cannot rewrite agent instructions', () => {
  const out = hardenLauncher(launcher);
  assert.match(out, /AURION_FORBIDS_FULLAUTO/);
  assert.match(out, /mode not in \["ReadOnly", "AskBeforeWrite"\]/);
  assert.doesNotMatch(out, /\n\t_ensure_agent_instructions\(\)\n/);
  assert.throws(() => hardenLauncher('No launch function'), /SOURCE_DRIFT/);
});

test('stage-only project plugin registration does not alter renderer or existing plugins', () => {
  const out = enableAssistantInStagedProject(project);
  assert.match(out, /aurion_android_app_link/);
  assert.match(out, /godot_assistant\/plugin.cfg/);
  assert.equal(enableAssistantInStagedProject(out), out);
  assert.throws(() => enableAssistantInStagedProject('[editor_plugins]\nenabled=PackedStringArray("other")'), /PROJECT_DRIFT/);
});

test('staged editor must inherit Aurion owner and memory policy', () => {
  assert.equal(validateEditorPolicy('# Echoes of Aurion\nAurion is the single and only canonical owner.\nRead Memory.md before edits.'), true);
  assert.throws(() => validateEditorPolicy('Godot gameplay is client-owned'), /AURION_POLICY_MISSING/);
});

test('upstream addon paths reject symlinks, traversal, native files, and unexpected extensions', () => {
  assert.equal(validateSourcePaths(['plugin.cfg', 'plugin.gd', 'plugin.gd.uid', 'bridge_client.gd']), 4);
  for (const bad of ['../secrets', '/etc/passwd', 'tool.exe', 'evil.dll', 'link', 'sub\\foo.gd', 'a/.hidden', 'service/Program.cs']) {
    assert.throws(() => validateSourcePaths(['plugin.cfg', bad]), /UNSAFE_ADDON_PATH/);
  }
  assert.throws(() => validateSourcePaths([]), /EMPTY_ADDON/);
});

test('stage destination must be outside source and canonical Godot project', () => {
  assertSafeTarget('/tmp/editor', '/tmp/upstream', '/home/me/repo/godot-client');
  assert.throws(() => assertSafeTarget('/tmp/upstream', '/tmp/upstream', '/home/me/repo/godot-client'), /UNSAFE_TARGET/);
  assert.throws(() => assertSafeTarget('/home/me/repo/godot-client/evil', '/tmp/upstream', '/home/me/repo/godot-client'), /UNSAFE_TARGET/);
});


test('existing Aurion projects and symlink targets are rejected before any edit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aurion-assistant-isolation-'));
  try {
    const source = join(root, 'upstream');
    const other = join(root, 'another-real-aurion', 'godot-client');
    await mkdir(source);
    await mkdir(other, {recursive:true});
    await writeFile(join(other, 'project.godot'), project);
    await writeFile(join(other, 'AGENTS.md'), '# Echoes of Aurion\nAurion is the single and only canonical owner. Read Memory.md.');
    await assert.rejects(stageGodotAssistant({source, target:other}), /TARGET_ALREADY_EXISTS/);
    const link = join(root, 'target-link');
    await symlink(other, link);
    await assert.rejects(stageGodotAssistant({source, target:link}), /TARGET_ALREADY_EXISTS/);
    await assert.rejects(stageGodotAssistant({source, target:join(other, '..', 'godot-client')}), /TARGET_ALREADY_EXISTS/);
    assert.equal(await readFile(join(other, 'project.godot'), 'utf8'), project);
    await assert.rejects(readFile(join(other, 'addons/godot_assistant/plugin.cfg')), {code:'ENOENT'});
  } finally { await rm(root, {recursive:true, force:true}); }
});
