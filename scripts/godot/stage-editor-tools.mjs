#!/usr/bin/env node
/**
 * Isolated Godot 4.7 editor-only tooling trial. No changes to the source
 * project, runtime APK, servers, gameplay rules, or production data.
 * Repository owner pins are deliberately immutable; a different version
 * requires a reviewed code change and real editor CI.
 */
import assert from 'node:assert/strict';
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ASSET_PLACER = Object.freeze({
  repository: 'https://github.com/levinzonr/godot-asset-placer',
  commit: '1dbf9fd782566780d6a6c52bd4197f448622f0aa',
  version: '1.6.0',
  folder: 'addons/asset_placer',
  editorOnly: true,
  license: 'MIT',
});

export function validateAssetPlacerSource({ commit, pluginConfig, license, paths }) {
  assert.equal(commit, ASSET_PLACER.commit, 'EDITOR_TOOL_SHA_MISMATCH');
  assert.match(pluginConfig, /^name="Godot Asset Placer"$/m, 'EDITOR_TOOL_IDENTITY');
  assert.match(pluginConfig, /^version="1\.6\.0"$/m, 'EDITOR_TOOL_VERSION');
  assert.match(pluginConfig, /^script="asset_placer_plugin\.gd"$/m, 'EDITOR_TOOL_ENTRY');
  assert.match(license, /^MIT License/m, 'EDITOR_TOOL_LICENSE_MISSING');
  assert.match(license, /Copyright \(c\) 2025 Roman Levinzon/, 'EDITOR_TOOL_AUTHOR_MISSING');
  assert.ok(paths.length > 0, 'EDITOR_TOOL_EMPTY');
  for (const path of paths) {
    assert.ok(!isAbsolute(path) && !path.includes('\\') &&
      !path.split('/').includes('..') && path !== '' && !path.startsWith('/'),
      'EDITOR_TOOL_UNSAFE_PATH: ' + path);
    assert.ok(!/\.(so|dylib|dll|apk|gdextension|exe)$/i.test(path),
      'EDITOR_TOOL_NATIVE_BINARY_FORBIDDEN: ' + path);
  }
  return ASSET_PLACER;
}

const expected = 'enabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg")';
const upgraded = 'enabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg", "res://addons/asset_placer/plugin.cfg")';
export function enableEditorOnlyTool(project) {
  if (project.includes(upgraded)) return project;
  assert.ok(project.includes('[editor_plugins]') && project.includes(expected), 'EDITOR_PLUGIN_SETTINGS_MISSING');
  return project.replace(expected, upgraded);
}

async function scanFiles(dir, base=dir) {
  const files=[];
  for (const e of await readdir(dir, {withFileTypes:true})) {
    assert.ok(!e.isSymbolicLink(), 'EDITOR_TOOL_SYMLINK_FORBIDDEN');
    const path=join(dir,e.name);
    if (e.isDirectory()) files.push(...await scanFiles(path,base));
    else if (e.isFile()) files.push(relative(base,path).split(sep).join('/'));
    else throw Error('EDITOR_TOOL_UNSUPPORTED_ENTRY: '+path);
  }
  return files;
}

export async function stageAssetPlacer({source,target}) {
  const sourceRoot=await realpath(resolve(source));
  const stageRoot=await realpath(resolve(target));
  const canonicalProject=resolve(dirname(fileURLToPath(import.meta.url)),'../../godot-client');
  assert.ok(stageRoot !== canonicalProject && !stageRoot.startsWith(canonicalProject+sep),
    'EDITOR_TOOL_REFUSE_SOURCE_PROJECT_MUTATION');
  assert.ok(stageRoot !== sourceRoot && !stageRoot.startsWith(sourceRoot+sep),
    'EDITOR_TOOL_REFUSE_SOURCE_CHECKOUT_MUTATION');
  assert.ok((await stat(join(stageRoot,'project.godot'))).isFile(), 'EDITOR_TOOL_STAGED_PROJECT_MISSING');
  const sha=spawnSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8',timeout:15000});
  assert.ok(!sha.error&&sha.status===0, 'EDITOR_TOOL_GIT_READBACK_FAILED');
  const cfg=await readFile(join(sourceRoot,ASSET_PLACER.folder,'plugin.cfg'),'utf8');
  const lic=await readFile(join(sourceRoot,'LICENSE'),'utf8');
  const plugin=join(sourceRoot,ASSET_PLACER.folder);
  assert.ok((await lstat(plugin)).isDirectory(), 'EDITOR_TOOL_FOLDER_MISSING');
  const paths=await scanFiles(plugin);
  const lock=validateAssetPlacerSource({commit:sha.stdout.trim(),pluginConfig:cfg,license:lic,paths});
  const addon=join(stageRoot,ASSET_PLACER.folder);
  const workspace=join(stageRoot,'addons');
  await mkdir(workspace,{recursive:true});
  try { await lstat(addon); throw Error('EDITOR_TOOL_EXISTS_REFUSE_OVERWRITE'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  const temporary=join(workspace,'.asset_placer_staging_'+process.pid);
  try {
    await cp(plugin,temporary,{recursive:true,force:false,errorOnExist:true,dereference:false});
    await writeFile(join(temporary,'LICENSE.upstream.txt'),lic);
    const original=await readFile(join(stageRoot,'project.godot'),'utf8');
    const enabled=enableEditorOnlyTool(original);
    await rename(temporary,addon);
    await writeFile(join(stageRoot,'project.godot'),enabled);
  } finally { await rm(temporary,{recursive:true,force:true}); }
  return {commit:lock.commit,version:lock.version,scope:'editor-only',files:paths.length,
    target:addon,license:'MIT',runtimeAuthority:'Aurion only'};
}

const self=fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1])===self) {
  assert.equal(process.argv.length,6,'usage: node scripts/godot/stage-editor-tools.mjs --source <pinned-upstream-checkout> --target <isolated-staged-godot-project>');
  assert.equal(process.argv[2],'--source');assert.equal(process.argv[4],'--target');
  const r=await stageAssetPlacer({source:process.argv[3],target:process.argv[5]});
  console.log('AURION_GODOT_EDITOR_ASSET_PLACER_STAGE_PASS '+JSON.stringify(r));
}
