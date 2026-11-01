import assert from 'node:assert/strict';
import {access,cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {repo,root,executable,lock,digest,run} from './toolchain.mjs';
import {androidReport} from './android-toolchain.mjs';

const revision=run('git',['-C',repo,'rev-parse','HEAD']);
assert.equal(revision,process.env.AURION_EXPECTED_REVISION);
run('git',['-C',repo,'diff','--exit-code','HEAD']);
const android=await androidReport();assert.equal(android.status,'ready');
// Reuse the existing Preview debug route; never load a release signer here.
const key=join(root,'debug-signing/debug.keystore');await access(key);
const output=resolve(process.env.AURION_SMOKE_OUTPUT);
await mkdir(output,{recursive:true});
const original=await readFile(join(repo,'godot-client/export_presets.cfg'),'utf8');
for(const guard of ['legacy','fixed']) {
 const job=await mkdtemp(join(root,'bridge-smoke-'));
 try {
  const project=join(job,'project');
  await cp(join(repo,'godot-client'),project,{recursive:true,filter:p=>!p.split('/').includes('.godot')});
  const preset=original.replace('architectures/arm64-v8a=true','architectures/arm64-v8a=false')
   .replace('architectures/x86_64=false','architectures/x86_64=true')
   .replace('permissions/internet=true','permissions/internet=false')
   .replace('org.ouroboroscollective.aurion.godot.preview','org.ouroboroscollective.aurion.godot.smoke');
  assert.notEqual(preset,original);
  await writeFile(join(project,'export_presets.cfg'),preset);
  const settingsPath=join(project,'project.godot');
  const settings=await readFile(settingsPath,'utf8');
  assert.equal(settings.split('server_base_url="https://arelogic.space"').length,2);
  assert.equal(settings.split('enabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg")').length,2);
  await writeFile(settingsPath,settings.replace('server_base_url="https://arelogic.space"','server_base_url="http://127.0.0.1:1"')
   .replace('enabled=PackedStringArray("res://addons/aurion_android_app_link/plugin.cfg")','enabled=PackedStringArray()'));
  // The disposable fixture keeps the same one-origin validator, bound only to
  // loopback. The APK has no INTERNET permission, including in the cold case.
  const configPath=join(project,'config/runtime_config.gd');
  const runtimeConfig=await readFile(configPath,'utf8');
  assert.equal(runtimeConfig.split('const PRODUCT_SERVER := "https://arelogic.space"').length,2);
  await writeFile(configPath,runtimeConfig.replace('const PRODUCT_SERVER := "https://arelogic.space"','const PRODUCT_SERVER := "http://127.0.0.1:1"'));
  await cp(join(repo,'scripts/godot/fixtures/native-intent-smoke.gd'),join(project,'bridge_smoke.gd'));
  await writeFile(join(project,'override.cfg'),`[autoload]\nAurionBridgeSmoke="*res://bridge_smoke.gd"\n[aurion]\nclient_build="${revision}"\nnative_auth_start_enabled=true\n[aurion_smoke]\nguard="${guard}"\n`);
  await cp(join(repo,'scripts/godot/fixtures/test-native-intent-smoke-report.gd'),join(project,'test_bridge_smoke_report.gd'));
  const bridge=join(project,'platform/android/native_intent_bridge.gd');
  if(guard==='legacy') {
   const s=await readFile(bridge,'utf8');
   const fixed='not runtime.has_method("has_java_method") or not runtime.has_java_method("getActivity")';
   assert.equal(s.split(fixed).length,2,'causal guard mutation must match exactly once');
   await writeFile(bridge,s.replace(fixed,'not runtime.has_method("getActivity")'));
  }
  const config=join(job,'config/godot'),data=join(job,'data/godot');
  await mkdir(config,{recursive:true});await mkdir(data,{recursive:true});
  await symlink(join(android.installation,'data/godot/export_templates'),join(data,'export_templates'));
  await writeFile(join(config,'editor_settings-4.7.tres'),`[gd_resource type="EditorSettings" format=3]\n[resource]\nexport/android/java_sdk_path = ${JSON.stringify(join(android.installation,'jdk'))}\nexport/android/android_sdk_path = ${JSON.stringify(join(android.installation,'sdk'))}\n`);
  const env={...process.env,XDG_CONFIG_HOME:join(job,'config'),XDG_DATA_HOME:join(job,'data'),JAVA_HOME:join(android.installation,'jdk'),GODOT_ANDROID_KEYSTORE_DEBUG_PATH:key,GODOT_ANDROID_KEYSTORE_DEBUG_USER:'androiddebugkey',GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD:'android'};
  const apk=join(output,guard+'.apk');
  for(const args of [['--editor','--import'],['--script','res://test_bridge_smoke_report.gd'],['--export-debug','Android Preview',apk]]) {
   const overridePath=join(project,'override.cfg');
   const smokeOverrides=await readFile(overridePath,'utf8');
   if(args[0]==='--script') await writeFile(overridePath,smokeOverrides.split('\n').filter(line=>!line.startsWith('AurionBridgeSmoke=')).join('\n'));
   const result=spawnSync(executable,['--headless','--path',project,...args],{env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
   await writeFile(overridePath,smokeOverrides);
   if(args[0]==='--script' && result.status!==0) console.error(result.stdout+result.stderr);
   assert.ok(!result.error&&result.status===0&&!/SCRIPT ERROR:|\bERROR:/.test(result.stdout+result.stderr),'SMOKE_APK_EXPORT_FAILED');
  }
  const tools=join(android.installation,'sdk/build-tools',lock.android.buildTools);
  const badging=run(join(tools,'aapt'),['dump','badging',apk]);
  const manifest=run(join(tools,'aapt'),['dump','xmltree',apk,'AndroidManifest.xml']);
  const signature=run(join(tools,'apksigner'),['verify','--verbose','--print-certs',apk]);
  assert.match(badging,/package: name='org\.ouroboroscollective\.aurion\.godot\.smoke'/);
  assert.match(badging,/native-code: 'x86_64'\s*$/m);
  assert.match(signature,/Verified using v2 scheme.*true/);
  assert.ok(!badging.includes('android.permission.INTERNET'),'SMOKE_NETWORK_PERMISSION_FORBIDDEN');
  assert.ok(!manifest.includes('arelogic.space'),'SMOKE_PRODUCTION_DOMAIN_FILTER_FORBIDDEN');
  const alias=manifest.split(/(?=^ {6}E: )/m).find(s=>s.startsWith('      E: activity-alias (')&&s.includes('android.intent.action.MAIN'));
  assert.ok(alias);assert.match(alias,/android:exported[^\n]*0xffffffff/);
  const launcher=alias.match(/android:name[^\n]*="([^"]+)"/)?.[1];assert.ok(launcher);
  const entries=run('unzip',['-Z1',apk]).split('\n');
  assert.ok(entries.includes('lib/x86_64/libgodot_android.so'));
  assert.ok(!entries.some(p=>p.startsWith('lib/')&&!p.startsWith('lib/x86_64/')));
  await writeFile(join(output,guard+'-build.json'),JSON.stringify({schemaVersion:1,sourceRevision:revision,guard,package:'org.ouroboroscollective.aurion.godot.smoke',launcher,apkSha256:await digest(apk),bridgeSha256:await digest(bridge),engine:lock.engine.version,productionApk:false,internetPermission:false,productionDomainFilter:false,configuredOrigin:'loopback-only',signer:'existing-preview-debug'},null,2));
 } finally {await rm(job,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
assert.equal(await readFile(join(repo,'godot-client/export_presets.cfg'),'utf8'),original);
run('git',['-C',repo,'diff','--exit-code','HEAD']);
console.log('SMOKE_DEBUG_APKS_VERIFIED / ANDROID_EXECUTION_PENDING');
