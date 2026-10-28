#!/usr/bin/env node
/**
 * Stages a reviewed Godot Assistant release in a disposable Godot 4.7.2 editor
 * checkout. This script never changes the canonical Godot project or the
 * game server, and it never provides production gameplay authority.
 * Source: pinned upstream, no downloads or implicit source mutation.
 */
import assert from 'node:assert/strict';
import {cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const ASSISTANT_PIN = Object.freeze({
  repository: 'https://github.com/splatterfacegames/godot-assistant',
  commit: 'a6aed65584cf8cccd32a75e5a93e22b752a0b00a',
  version: '0.1.0',
  addon: 'addons/godot_assistant',
  editorOnly: true,
  runtimeAuthority: 'Aurion only',
});

const replaceOnce = (text, original, replacement) => {
  assert.equal(text.split(original).length, 2, 'ASSISTANT_SOURCE_DRIFT');
  return text.replace(original, replacement);
};

export function validateAssistantSource({commit, clean, pluginConfig, license, csproj}) {
  assert.equal(commit, ASSISTANT_PIN.commit, 'ASSISTANT_PIN_MISMATCH');
  assert.equal(clean, true, 'ASSISTANT_SOURCE_DIRTY');
  assert.match(pluginConfig, /^name="Godot Assistant"$/m, 'ASSISTANT_PLUGIN_IDENTITY');
  assert.match(pluginConfig, /^version="0\.1\.0"$/m, 'ASSISTANT_PLUGIN_VERSION');
  assert.match(pluginConfig, /^script="plugin\.gd"$/m, 'ASSISTANT_PLUGIN_ENTRY');
  assert.match(license, /^MIT License/m, 'ASSISTANT_LICENSE_MISSING');
  assert.match(csproj, /<TargetFramework>net8\.0<\/TargetFramework>/, 'ASSISTANT_NET8_REQUIRED');
  assert.match(csproj, /<Project Sdk="Microsoft\.NET\.Sdk">/, 'ASSISTANT_PROJECT_IDENTITY');
  assert.ok(!/<(?:Exec|Import|UsingTask|Target|PackageReference)\b/i.test(csproj), 'ASSISTANT_UNSAFE_CSPROJ');
  return ASSISTANT_PIN;
}

export function validateEditorPolicy(policy) {
  assert.ok(typeof policy === 'string' &&
    policy.includes('Echoes of Aurion') &&
    policy.includes('single and only canonical owner') &&
    policy.includes('Memory.md'), 'ASSISTANT_AURION_POLICY_MISSING');
  return true;
}

export function validateSourcePaths(paths) {
  assert.ok(paths.length > 0, 'ASSISTANT_EMPTY_ADDON');
  for (const path of paths) {
    assert.ok(!isAbsolute(path) && !path.includes('\\') &&
      !path.startsWith('.') && !path.split('/').some(p => p === '..' || p.startsWith('.') || !p) &&
      /(?:\.gd|\.gd\.uid|\.cfg)$/.test(path), 'ASSISTANT_UNSAFE_ADDON_PATH: ' + path);
  }
  return paths.length;
}

export function assertSafeTarget(target, source, canonical) {
  const a = resolve(target), b = resolve(source), c = resolve(canonical);
  for (const root of [b,c]) {
    assert.ok(a !== root && !a.startsWith(root + sep) &&
      !root.startsWith(a + sep), 'ASSISTANT_UNSAFE_TARGET');
  }
}

export function hardenServiceProgram(program) {
  const old = 'if (!Enum.TryParse<PermissionMode>(request.Mode, true, out var mode)) mode = PermissionMode.AskBeforeWrite;';
  const hardened = `if (!Enum.TryParse<PermissionMode>(request.Mode, true, out var mode) ||
                mode is not (PermissionMode.ReadOnly or PermissionMode.AskBeforeWrite))
            {
                await JsonAsync(context, 403, new { error = "AURION_FORBIDS_FULLAUTO" });
                return;
            }`;
  return replaceOnce(program, old, hardened);
}

export function hardenDock(dock) {
  let value = replaceOnce(dock, '\tmode.add_item("YOLO (agent + Godot)")\n', '');
  value = replaceOnce(value,
    'mode.tooltip_text = "YOLO disables both the agent\'s native approvals and Godot Assistant\'s mutation prompts for this session."',
    'mode.tooltip_text = "Aurion: read-only or explicit approval for edits. No full-auto mode."');
  value = replaceOnce(value, 'var modes := ["AskBeforeWrite", "ReadOnly", "FullAuto"]',
    'var modes := ["AskBeforeWrite", "ReadOnly"]\n\tif mode.selected not in [0, 1]:\n\t\tstatus_label.text = "AURION_PERMISSION_MODE_DENIED"\n\t\tbutton.disabled = false\n\t\treturn');
  return value;
}

export function hardenLauncher(launcher) {
  let result = replaceOnce(launcher, 'func launch(provider: String, mode: String) -> Dictionary:\n',
    'func launch(provider: String, mode: String) -> Dictionary:\n\tif mode not in ["ReadOnly", "AskBeforeWrite"]:\n\t\treturn {"ok": false, "message": "AURION_FORBIDS_FULLAUTO"}\n');
  result = replaceOnce(result, '\t_ensure_agent_instructions()\n',
    '\t# Aurion project policy is owned by the checkout, not injected by an add-on.\n');
  for (const line of [
    '\t\t\t\t"FullAuto": return " --dangerously-skip-permissions"\n',
    '\t\t\t\t"FullAuto": return " --dangerously-bypass-approvals-and-sandbox"\n',
    '\t\t\t\t"FullAuto": return " --always-approve --permission-mode bypassPermissions"\n',
  ]) result = replaceOnce(result, line, '');
  return result;
}

const previous = 'enabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg")';
const staged = 'enabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg", "res://addons/godot_assistant/plugin.cfg")';
export function enableAssistantInStagedProject(project) {
  if (project.includes(staged)) return project;
  assert.ok(project.includes('[editor_plugins]') && project.includes(previous), 'ASSISTANT_PROJECT_DRIFT');
  return replaceOnce(project, previous, staged);
}

async function scan(dir, root=dir) {
  const paths = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'ASSISTANT_SOURCE_SYMLINK');
    if (entry.isDirectory()) paths.push(...await scan(full, root));
    else if (entry.isFile()) paths.push(relative(root, full).split(sep).join('/'));
    else throw new Error('ASSISTANT_SOURCE_SPECIAL_FILE');
  }
  return paths;
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', timeout: 15000});
  assert.ok(!result.error && result.status === 0, 'ASSISTANT_GIT_READBACK_FAILED');
  return result.stdout.trim();
}

async function mustBeAbsent(path) {
  try { await lstat(path); throw new Error('ASSISTANT_TARGET_ALREADY_EXISTS'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}

export async function stageGodotAssistant({source, target}) {
  const upstream = await realpath(resolve(source));
  const project = await realpath(resolve(target));
  const canonical = resolve(dirname(fileURLToPath(import.meta.url)), '../../godot-client');
  assertSafeTarget(project, upstream, canonical);
  assert.ok((await stat(join(project, 'project.godot'))).isFile(), 'ASSISTANT_PROJECT_MISSING');
  validateEditorPolicy(await readFile(join(project, 'AGENTS.md'), 'utf8'));
  const sha = runGit(upstream, ['rev-parse', 'HEAD']);
  const clean = runGit(upstream, ['status', '--porcelain', '--untracked-files=all']) === '';
  const pluginConfig = await readFile(join(upstream, ASSISTANT_PIN.addon, 'plugin.cfg'), 'utf8');
  const license = await readFile(join(upstream, 'LICENSE'), 'utf8');
  const csproj = await readFile(join(upstream, 'service/GodotAssistant.Service/GodotAssistant.Service.csproj'), 'utf8');
  validateAssistantSource({commit: sha, clean, pluginConfig, license, csproj});
  const addonPaths = await scan(join(upstream, ASSISTANT_PIN.addon));
  validateSourcePaths(addonPaths);
  const servicePaths = await scan(join(upstream, 'service/GodotAssistant.Service'));
  assert.ok(servicePaths.length > 5 && servicePaths.every(p => /(?:\.cs|\.csproj)$/.test(p)), 'ASSISTANT_UNSAFE_SERVICE_PATH');
  for (const required of ['plugin.cfg','plugin.gd','assistant_dock.gd','harness_launcher.gd','bridge_client.gd','tool_executor.gd']) {
    assert.ok(addonPaths.includes(required), 'ASSISTANT_ADDON_MISSING: ' + required);
  }
  const originalProject = await readFile(join(project, 'project.godot'), 'utf8');
  const updatedProject = enableAssistantInStagedProject(originalProject);
  assert.notEqual(updatedProject, originalProject, 'ASSISTANT_PLUGIN_ALREADY_ENABLED');
  const destination = join(project, ASSISTANT_PIN.addon);
  await mustBeAbsent(destination);
  const temporary = await mkdtemp(join(tmpdir(), 'aurion-godot-assistant-'));
  let installed = false;
  try {
    const addon = join(temporary, 'addon');
    const service = join(temporary, 'service-source');
    await cp(join(upstream, ASSISTANT_PIN.addon), addon, {recursive: true, dereference: false});
    await cp(join(upstream, 'service/GodotAssistant.Service'), service, {recursive: true, dereference: false});
    await writeFile(join(addon, 'assistant_dock.gd'), hardenDock(await readFile(join(addon, 'assistant_dock.gd'), 'utf8')));
    await writeFile(join(addon, 'harness_launcher.gd'), hardenLauncher(await readFile(join(addon, 'harness_launcher.gd'), 'utf8')));
    await writeFile(join(service, 'Program.cs'), hardenServiceProgram(await readFile(join(service, 'Program.cs'), 'utf8')));
    await writeFile(join(addon, 'LICENSE.upstream.txt'), license);
    const built = join(addon, 'service');
    const compile = spawnSync('dotnet', ['publish', join(service, 'GodotAssistant.Service.csproj'),
      '-c', 'Release', '--self-contained', 'false', '-o', built],
      {encoding: 'utf8', timeout: 180000, maxBuffer: 4*1024*1024});
    if (compile.error || compile.status !== 0) {
      throw new Error('ASSISTANT_DOTNET_PUBLISH_FAILED: ' +
        String(compile.error?.message ?? compile.stderr ?? compile.stdout).slice(-1600));
    }
    assert.ok((await stat(join(built, 'GodotAssistant.Service.dll'))).isFile(), 'ASSISTANT_RELAY_MISSING');
    assert.equal(runGit(upstream, ['rev-parse', 'HEAD']), ASSISTANT_PIN.commit, 'ASSISTANT_SOURCE_CHANGED');
    assert.equal(runGit(upstream, ['status', '--porcelain', '--untracked-files=all']), '', 'ASSISTANT_SOURCE_CHANGED');
    await mkdir(join(project, 'addons'), {recursive: true});
    await mustBeAbsent(destination);
    await rename(addon, destination);
    installed = true;
    await writeFile(join(project, 'project.godot'), updatedProject);
    return {repository: ASSISTANT_PIN.repository, commit: sha, version: ASSISTANT_PIN.version,
      target: destination, permissionModes: ['ReadOnly', 'AskBeforeWrite'],
      license: 'MIT', editorOnly: true, runtimeAuthority: ASSISTANT_PIN.runtimeAuthority};
  } catch (error) {
    if (installed) await rm(destination, {recursive: true, force: true});
    throw error;
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  (async () => {
    assert.equal(process.argv.length, 6,
      'usage: node scripts/godot/stage-godot-assistant.mjs --source <pinned-upstream-checkout> --target <disposable-godot-project>');
    assert.equal(process.argv[2], '--source');
    assert.equal(process.argv[4], '--target');
    const receipt = await stageGodotAssistant({source: process.argv[3], target: process.argv[5]});
    console.log('AURION_GODOT_ASSISTANT_EDITOR_STAGE_PASS ' + JSON.stringify(receipt));
  })().catch(error => {console.error(error.message); process.exitCode = 1;});
}
