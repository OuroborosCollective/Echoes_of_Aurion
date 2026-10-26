import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssetPlacerSource, enableEditorOnlyTool } from './stage-editor-tools.mjs';
const pinned = '1dbf9fd782566780d6a6c52bd4197f448622f0aa';
const cfg = '[plugin]\nname="Godot Asset Placer"\nversion="1.6.0"\nscript="asset_placer_plugin.gd"\n';
const license = 'MIT License\nCopyright (c) 2025 Roman Levinzon';
test('pinned source and editor only', () => {
 const p=validateAssetPlacerSource({commit:pinned,pluginConfig:cfg,license,paths:['plugin.cfg','ui/panel.tscn']});
 assert.equal(p.version,'1.6.0');assert.equal(p.editorOnly,true);
});
test('rejects wrong version, unsafe files, absent MIT attribution', () => {
 const good={commit:pinned,pluginConfig:cfg,license,paths:['plugin.cfg']};
 for(const bad of [{...good,commit:'f'.repeat(40)},{...good,pluginConfig:cfg.replace('1.6.0','1.7.0')},{...good,license:''},{...good,paths:['../../evil.gd']},{...good,paths:['bin/extra.so']},{...good,paths:['plugin.gdextension']}])
  assert.throws(()=>validateAssetPlacerSource(bad));
});
test('editor configuration is scoped and idempotent',()=>{
 const original='[editor_plugins]\nenabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg")\n\n[application]\nrun/main_scene="res://app/main.tscn"\n';
 const changed=enableEditorOnlyTool(original);
 assert.match(changed,/asset_placer\/plugin.cfg/);
 assert.match(changed,/aurion_android_app_link\/plugin.cfg/);
 assert.match(changed,/run\/main_scene/);
 assert.equal(enableEditorOnlyTool(changed),changed);
 assert.throws(()=>enableEditorOnlyTool('[application]'),/EDITOR_PLUGIN_SETTINGS_MISSING/);
});
