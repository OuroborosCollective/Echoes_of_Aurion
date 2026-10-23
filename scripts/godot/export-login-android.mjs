import assert from 'node:assert/strict';
import { cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile,lstat,rename,copyFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repo,root,executable,lock,digest,run } from './toolchain.mjs';
import { androidReport } from './android-toolchain.mjs';
import { inspectLoginGradleSdk,verifyGodotGradleVersions } from './gradle-prerequisites.mjs';
import { stageGodotGradleBuild } from './android-gradle-link.mjs';
import { createLoginPreset,validateSignerConfig,verifySignerOnDisk,validateLoginArtifact,validateLoginManifest,loginPackage } from './login-gradle-export.mjs';
import { requireLoginReleaseInputs,createLoginOverride,assertPackagedBuildRevision,verifyLiveAssetlinks,LOGIN_APK_FILENAME } from './login-release-gates.mjs';

function checked(binary,args,env,timeout=60000) {
 const p=spawnSync(binary,args,{env,encoding:'utf8',timeout,maxBuffer:4*1024*1024});
 assert.ok(!p.error&&p.status===0,'release tool failed (inspect private operator logs)');
 return p.stdout;
}
async function loginExport(env, unsigned) {
 const request=requireLoginReleaseInputs(env);
 const signer=unsigned ? null : validateSignerConfig(env);
 if(unsigned) {
  for(const key of ['AURION_LOGIN_KEYSTORE_PATH','AURION_LOGIN_KEYSTORE_PASSWORD','AURION_LOGIN_KEY_ALIAS','AURION_LOGIN_KEY_PASSWORD'])
   assert.ok(!env[key],'unsigned regression must not receive signing credentials');
 }
 const revision=run('git',['-C',repo,'rev-parse','HEAD']);
 assert.equal(revision,request.revision);
 run('git',['-C',repo,'diff','--exit-code','HEAD']);
 assert.equal(run('git',['-C',repo,'ls-files','--others','--exclude-standard','godot-client','scripts/godot']),'');
 const baseline=await androidReport();
 assert.equal(baseline.status,'ready','pinned Preview SDK must remain verified');
 const versions=lock.android.gradleRequirements;
 await inspectLoginGradleSdk(request.sdkRoot,versions);
 const jdk=join(baseline.installation,'jdk');
 if(signer) await verifySignerOnDisk(env,join(jdk,'bin/keytool'));
 const version=lock.engine.version.split('.stable.official')[0]+'.stable';
 const archive=join(baseline.installation,'data/godot/export_templates',version,'android_source.zip');
 verifyGodotGradleVersions(run('unzip',['-p',archive,'config.gradle']),versions);
 await mkdir(request.outputDirectory,{recursive:true,mode:0o700});
 const outputStat=await lstat(request.outputDirectory);
 assert.ok(outputStat.isDirectory()&&!outputStat.isSymbolicLink()&&(outputStat.mode&0o077)===0,'private output required');
 const destination=join(request.outputDirectory,revision);
 try {await lstat(destination);throw Error('refuse release overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const job=await mkdtemp(join(root,'signed-login-'));
 try {
  const project=join(job,'project');
  await cp(join(repo,'godot-client'),project,{recursive:true,filter:p=>!p.split('/').includes('.godot')});
  const original=await readFile(join(project,'export_presets.cfg'),'utf8');
  const preset=createLoginPreset(original);
  await writeFile(join(project,'export_presets.cfg'),unsigned ? preset.replaceAll('package/signed=true','package/signed=false') : preset,{mode:0o600});
  await writeFile(join(project,'override.cfg'),createLoginOverride(revision),{mode:0o600});
  await stageGodotGradleBuild({archive,project,version});
  const manifestSource=await readFile(join(project,'android/build/src/main/AndroidManifest.xml'),'utf8');
  assert.match(manifestSource,/android:host="arelogic.space"/);
  assert.match(manifestSource,/android:path="\/app\/auth\/callback"/);
  const config=join(job,'config/godot'),data=join(job,'data/godot');
  await mkdir(config,{recursive:true});await mkdir(data,{recursive:true});
  await symlink(join(baseline.installation,'data/godot/export_templates'),join(data,'export_templates'));
  await writeFile(join(config,'editor_settings-4.7.tres'),`[gd_resource type="EditorSettings" format=3]\n\n[resource]\nexport/android/java_sdk_path = ${JSON.stringify(jdk)}\nexport/android/android_sdk_path = ${JSON.stringify(request.sdkRoot)}\n`,{mode:0o600});
  const buildEnv={...env,XDG_CONFIG_HOME:join(job,'config'),XDG_DATA_HOME:join(job,'data'),JAVA_HOME:jdk,ANDROID_HOME:request.sdkRoot,ANDROID_SDK_ROOT:request.sdkRoot,GRADLE_USER_HOME:join(job,'gradle-home'),...(signer ? {GODOT_ANDROID_KEYSTORE_RELEASE_PATH:signer.keystorePath,GODOT_ANDROID_KEYSTORE_RELEASE_USER:signer.alias,GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD:env.AURION_LOGIN_KEYSTORE_PASSWORD} : {})};
  const apk=join(job,LOGIN_APK_FILENAME);
  for(const [label,args,timeout] of [['import',['--editor','--import'],240000],['export',['--export-release','Android Login',apk],1200000]]) {
   const result=spawnSync(executable,['--headless','--path',project,...args],{env:buildEnv,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
   if(unsigned) await writeFile(join(request.outputDirectory,label+'.log'),(result.stdout||'')+(result.stderr||''));
   assert.ok(!result.error&&result.status===0,'Godot '+label+' failed; no release published');
  }
  const tools=join(request.sdkRoot,'build-tools',versions.buildTools);
  const badging=checked(join(tools,'aapt'),['dump','badging',apk],buildEnv);
  const manifest=checked(join(tools,'aapt'),['dump','xmltree',apk,'AndroidManifest.xml'],buildEnv);
  let signature='';
  if(unsigned) {
   const verification=spawnSync(join(tools,'apksigner'),['verify',apk],{env:buildEnv,encoding:'utf8',timeout:60000});
   assert.ok(!verification.error && verification.status===1,'regression input must be unsigned');
   await writeFile(join(request.outputDirectory,'badging.log'),badging);
   await writeFile(join(request.outputDirectory,'manifest.log'),manifest);
  } else signature=checked(join(tools,'apksigner'),['verify','--verbose','--print-certs',apk],buildEnv);
  const entries=run('unzip',['-Z1',apk]).split('\n');
  const identity=unsigned ? validateLoginManifest({badging,manifest,entries}) : validateLoginArtifact({badging,manifest,signature,entries,expectedFingerprint:signer.expectedFingerprint});
  assert.match(manifest,/screenOrientation.*0x0/);
  const packed=checked('unzip',['-p',apk,'assets/override.cfg'],buildEnv);
  assertPackagedBuildRevision(packed,revision);
  const association=await verifyLiveAssetlinks({packageName:loginPackage,fingerprint:signer?.expectedFingerprint || env.AURION_LOGIN_SIGNER_SHA256});
  assert.equal((await androidReport()).treeSha256,baseline.treeSha256,'Preview SDK changed');
  const evidence={schemaVersion:1,sourceRevision:revision,apkSha256:await digest(apk),packageName:identity.packageName,signerSha256:signer?.expectedFingerprint || null,signingState:unsigned?'unsigned':'verified',assetlinks:association,device:'unverified',toolchainLockSha256:await digest(join(repo,'config/godot-toolchain.lock.json'))};
  const staging=await mkdtemp(join(request.outputDirectory,'.signed-login-'));
  try {
   await copyFile(apk,join(staging,LOGIN_APK_FILENAME));
   await writeFile(join(staging,'build-evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
   await rename(staging,destination);
  } finally {await rm(staging,{recursive:true,force:true});}
  console.log((unsigned?'UNSIGNED LOGIN REGRESSION VERIFIED / NOT INSTALLABLE: ':'SIGNED LOGIN APK VERIFIED / DEVICE UNVERIFIED: ')+destination);
  return evidence;
 } finally {await rm(job,{recursive:true,force:true});}
}
export async function signedLoginExport(env=process.env) { return loginExport(env,false); }
export async function unsignedLoginExport(env=process.env) { return loginExport(env,true); }
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 assert.ok(process.argv.length===2 || (process.argv.length===3 && process.argv[2]==='--unsigned'),'unknown export argument');
 await (process.argv[2]==='--unsigned' ? unsignedLoginExport() : signedLoginExport());
}
