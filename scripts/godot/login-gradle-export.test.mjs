import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,chmod,rm,symlink,mkdir,writeFile,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createLoginPreset,validateSignerConfig,validateLoginArtifact,validateLoginManifest,verifySignerOnDisk } from './login-gradle-export.mjs';
import { unsignedLoginExport } from './export-login-android.mjs';
const preset='[preset.0]\nname="Android Preview"\nplatform="Android"\ninclude_filter="net/contracts/*.json,override.cfg"\n[preset.0.options]\ngradle_build/use_gradle_build=false\nversion/name="0.1.0-preview"\npackage/unique_name="org.ouroboroscollective.aurion.godot.preview"\npackage/name="Aurion Preview"\npackage/signed=true\narchitectures/arm64-v8a=true\n';
const fp='A1:'.repeat(31)+'A1';
const signer={AURION_LOGIN_KEYSTORE_PATH:'/secured/aurion.jks',AURION_LOGIN_KEY_ALIAS:'aurion',AURION_LOGIN_KEYSTORE_PASSWORD:'test123456',AURION_LOGIN_KEY_PASSWORD:'test123456',AURION_LOGIN_SIGNER_SHA256:fp};
test('Gradle login preset is separate, classic Preview unchanged',()=>{
 const changed=createLoginPreset(preset);
 assert.equal(changed.slice(0,preset.length),preset);
 assert.match(changed,/\[preset\.1\]\nname="Android Login"/);
 assert.match(changed,/gradle_build\/use_gradle_build=true/);
 const loginPreset=changed.slice(changed.indexOf('[preset.1]'));
 assert.match(loginPreset,/package\/unique_name="org\.ouroboroscollective\.aurion\.godot\.login"/);
 assert.match(loginPreset,/package\/name="Aurion Login"/);
 assert.match(loginPreset,/version\/name="0\.1\.0-login"/);
 assert.throws(()=>createLoginPreset(changed));
});
test('tampered Preview config and mismatched signer fail closed',()=>{
 assert.throws(()=>createLoginPreset(preset.replace('false','true')));
 assert.equal(validateSignerConfig(signer).expectedFingerprint,fp);
 assert.throws(()=>validateSignerConfig({...signer,AURION_LOGIN_KEY_PASSWORD:'different'}),/same password/);
});
const badge="package: name='org.ouroboroscollective.aurion.godot.login' versionCode='1' versionName='0.1.0-login'\napplication-label:'Aurion Login'\nuses-permission: name='android.permission.INTERNET'\nnative-code: 'arm64-v8a'\nsdkVersion:'24'\ntargetSdkVersion:'36'";
const signature="Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: "+'a1'.repeat(32);
const manifest='      E: activity (line=1)\n        A: android:name="org.godotengine.godot.GodotApp"\n      E: activity-alias (line=2)\n        A: android:exported=(type 0x12)0xffffffff\n        A: android:targetActivity="org.godotengine.godot.GodotApp"\n        E: intent-filter (line=3)\n          A: android:name="android.intent.action.MAIN"\n          A: android:name="android.intent.category.LAUNCHER"\n        E: intent-filter (line=4)\n          A: android:autoVerify=(type 0x12)0xffffffff\n          A: android:name="android.intent.action.VIEW"\n          A: android:name="android.intent.category.DEFAULT"\n          A: android:name="android.intent.category.BROWSABLE"\n          A: android:scheme="https"\n          A: android:host="arelogic.space"\n          A: android:path="/app/auth/callback"';
const entries=['lib/arm64-v8a/libgodot_android.so','assets/override.cfg'];
const inspect=(m=manifest,s=signature,b=badge,e=entries)=>validateLoginArtifact({manifest:m,signature:s,badging:b,entries:e,expectedFingerprint:fp});
test('valid package cert and OS intent contract',()=>{assert.equal(inspect().certificateSha256,fp);assert.equal(inspect().packageName,'org.ouroboroscollective.aurion.godot.login');});
test('wrong signer package or unwanted permission rejected',()=>{
 assert.throws(()=>inspect(manifest,signature.replace('a1','ff')));
 assert.throws(()=>inspect(manifest,signature,badge.replace('godot.login','godot.preview').replace('Aurion Login','Aurion Preview').replace('0.1.0-login','0.1.0-preview')));
 assert.throws(()=>inspect(manifest,signature,badge.replace('godot.login','godot.fake')));
 assert.throws(()=>inspect(manifest,signature,badge+"\nuses-permission: name='android.permission.CAMERA'"));
});
test('missing callback verification and wrong host/path rejected',()=>{
 for(const m of [manifest.replace('android:autoVerify=(type 0x12)0xffffffff','android:autoVerify=(type 0x12)0x0'),manifest.replace('arelogic.space','wrong.test'),manifest.replace('/app/auth/callback','/wrong'),manifest.replace('android.intent.action.VIEW','android.intent.action.SEND')])assert.throws(()=>inspect(m));
});
test('no embedded revision or arm64 engine rejected',()=>{
 assert.throws(()=>inspect(manifest,signature,badge,['assets/override.cfg']));
 assert.throws(()=>inspect(manifest,signature,badge,['lib/arm64-v8a/libgodot_android.so']));
});
test('actual temporary keytool signer readback enforces permissions and certificate',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'aurion-keytest-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'test.jks');
 const env={...process.env,...signer,AURION_LOGIN_KEYSTORE_PATH:path,AURION_LOGIN_KEYSTORE_PASSWORD:'test-password-123',AURION_LOGIN_KEY_PASSWORD:'test-password-123'};
 const gen=spawnSync('keytool',['-genkeypair','-alias','aurion','-keyalg','RSA','-keysize','2048','-validity','3','-keystore',path,'-storepass:env','AURION_LOGIN_KEYSTORE_PASSWORD','-keypass:env','AURION_LOGIN_KEY_PASSWORD','-dname','CN=Test Only,O=No Production,C=DE','-noprompt'],{env,encoding:'utf8'});
 assert.equal(gen.status,0,gen.stderr);
 await chmod(path,0o600);
 const detail=spawnSync('keytool',['-list','-v','-keystore',path,'-alias','aurion','-storepass:env','AURION_LOGIN_KEYSTORE_PASSWORD'],{env,encoding:'utf8'});
 const sha=detail.stdout.match(/SHA256:\s*((?:[0-9A-F]{2}:){31}[0-9A-F]{2})/i)?.[1];assert.ok(sha);
 env.AURION_LOGIN_SIGNER_SHA256=sha;
 assert.equal((await verifySignerOnDisk(env,'keytool')).certificateSha256,sha.toUpperCase());
 await assert.rejects(verifySignerOnDisk({...env,AURION_LOGIN_SIGNER_SHA256:fp},'keytool'),/does not match/);
 await chmod(path,0o644);await assert.rejects(verifySignerOnDisk(env,'keytool'),/private/);
 const link=join(dir,'alias.jks');await symlink(path,link);await assert.rejects(verifySignerOnDisk({...env,AURION_LOGIN_KEYSTORE_PATH:link},'keytool'),/private/);
});

test('unsigned regression uses full manifest contract without synthetic signature evidence',()=>{
 assert.equal(validateLoginManifest({badging:badge,manifest,entries}).packageName,'org.ouroboroscollective.aurion.godot.login');
 const missing=manifest.slice(0,manifest.indexOf('        E: intent-filter (line=4)'));
 assert.throws(()=>validateLoginManifest({badging:badge,manifest:missing,entries}),/exactly one VIEW/);
 for(const wrong of [manifest.replace('arelogic.space','wrong.test'),manifest.replace('/app/auth/callback','/wrong')])
  assert.throws(()=>validateLoginManifest({badging:badge,manifest:wrong,entries}));
 assert.throws(()=>inspect(manifest,''),'signed release may not use unsigned manifest-only evidence');
});
test('unsigned runtime rejects signing credentials before starting tools',async()=>{
 const base={AURION_LOGIN_ALLOW_SIGNED_EXPORT:'1',AURION_LOGIN_GRADLE_SDK_ROOT:'/unused-sdk',AURION_LOGIN_APK_OUTPUT:'/unused-output',AURION_EXPECTED_REVISION:'a'.repeat(40)};
 for(const key of ['AURION_LOGIN_KEYSTORE_PATH','AURION_LOGIN_KEYSTORE_PASSWORD','AURION_LOGIN_KEY_ALIAS','AURION_LOGIN_KEY_PASSWORD'])
  await assert.rejects(unsignedLoginExport({...base,[key]:'forbidden-in-unsigned-mode'}),/must not receive signing credentials/);
});

test('workspace cleanup tolerates one late Gradle write but rejects persistent writes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'aurion-gradle-cleanup-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const persistent of [false,true]) {
  const victim=join(directory,persistent?'persistent':'transient');
  await mkdir(victim);await writeFile(join(victim,'initial.log'),'fixture');
  // In a fresh Node process, interpose the filesystem boundary before rm's
  // lazy initialization. The second rmdir occurs after children were removed:
  // adding a real file there reproduces the runner's actual ENOTEMPTY race.
  const child=spawnSync(process.execPath,['--input-type=module','-e',`
   import fs from 'node:fs';
   import {join} from 'node:path';
   import assert from 'node:assert/strict';
   const [victim,moduleUrl,mode]=process.argv.slice(1);
   const rmdir=fs.rmdir;let calls=0;
   fs.rmdir=function(path,...args) {
    if(String(path)===victim) {
     calls++;
     if(mode==='persistent'||calls===2) fs.writeFileSync(join(victim,'late.log'),'fixture');
    }
    return rmdir.call(this,path,...args);
   };
   const {cleanupLoginWorkspace}=await import(moduleUrl);
   if(mode==='persistent') await assert.rejects(cleanupLoginWorkspace(victim),{code:'ENOTEMPTY'});
   else await cleanupLoginWorkspace(victim);
   assert.ok(calls>=2&&calls<=20,'cleanup retry was absent or unbounded');
  `,victim,new URL('./export-login-android.mjs',import.meta.url).href,persistent?'persistent':'transient'],{encoding:'utf8',timeout:5000});
  assert.equal(child.status,0,child.stderr);
  if(persistent) assert.ok((await stat(victim)).isDirectory());
  else await assert.rejects(stat(victim),{code:'ENOENT'});
 }
});

