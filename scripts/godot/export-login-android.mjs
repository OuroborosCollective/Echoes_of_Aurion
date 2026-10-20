import assert from 'node:assert/strict';
import { cp,mkdir,mkdtemp,readFile,rm,symlink,writeFile,lstat,rename,copyFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repo,root,executable,lock,digest,run } from './toolchain.mjs';
import { androidReport } from './android-toolchain.mjs';
import { inspectLoginGradleSdk,verifyGodotGradleVersions } from './gradle-prerequisites.mjs';
import { stageGodotGradleBuild } from './android-gradle-link.mjs';
import { createLoginPreset,validateSignerConfig,verifySignerOnDisk,validateLoginArtifact,loginPackage } from './login-gradle-export.mjs';
import { requireLoginReleaseInputs,createLoginOverride,assertPackagedBuildRevision,verifyLiveAssetlinks,LOGIN_APK_FILENAME } from './login-release-gates.mjs';

function checked(binary,args,env,timeout=60000) {
 const p=spawnSync(binary,args,{env,encoding:'utf8',timeout,maxBuffer:4*1024*1024});
 assert.ok(!p.error&&p.status===0,'release tool failed (inspect private operator logs)');
 return p.stdout;
}
export async function signedLoginExport(env=process.env) {
 const request=requireLoginReleaseInputs(env);
 const signer=validateSignerConfig(env);
 const revision=run('git',['-C',repo,'rev-parse','HEAD']);
 assert.equal(revision,request.revision);
 run('git',['-C',repo,'diff','--exit-code','HEAD']);
 assert.equal(run('git',['-C',repo,'ls-files','--others','--exclude-standard','godot-client','scripts/godot']),'');
 const baseline=await androidReport();
 assert.equal(baseline.status,'ready','pinned Preview SDK must remain verified');
 const versions=lock.android.gradleRequirements;
 await inspectLoginGradleSdk(request.sdkRoot,versions);
 const jdk=join(baseline.installation,'jdk');
 await verifySignerOnDisk(env,join(jdk,'bin/keytool'));
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
  await writeFile(join(project,'export_presets.cfg'),createLoginPreset(original),{mode:0o600});
  await writeFile(join(project,'override.cfg'),createLoginOverride(revision),{mode:0o600});
  await stageGodotGradleBuild({archive,project,version});
  const manifestSource=await readFile(join(project,'android/build/src/main/AndroidManifest.xml'),'utf8');
  assert.match(manifestSource,/android:host="arelogic.space"/);
  assert.match(manifestSource,/android:path="\/app\/auth\/callback"/);
  const config=join(job,'config/godot'),data=join(job,'data/godot');
  await mkdir(config,{recursive:true});await mkdir(data,{recursive:true});
  await symlink(join(baseline.installation,'data/godot/export_templates'),join(data,'export_templates'));
  await writeFile(join(config,'editor_settings-4.7.tres'),`[gd_resource type="EditorSettings" format=3]\n\n[resource]\nexport/android/java_sdk_path = ${JSON.stringify(jdk)}\nexport/android/android_sdk_path = ${JSON.stringify(request.sdkRoot)}\n`,{mode:0o600});
  const buildEnv={...env,XDG_CONFIG_HOME:join(job,'config'),XDG_DATA_HOME:join(job,'data'),JAVA_HOME:jdk,ANDROID_HOME:request.sdkRoot,ANDROID_SDK_ROOT:request.sdkRoot,GRADLE_USER_HOME:join(job,'gradle-home'),GODOT_ANDROID_KEYSTORE_RELEASE_PATH:signer.keystorePath,GODOT_ANDROID_KEYSTORE_RELEASE_USER:signer.alias,GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD:env.AURION_LOGIN_KEYSTORE_PASSWORD};
  const apk=join(job,LOGIN_APK_FILENAME);
  for(const [label,args,timeout] of [['import',['--editor','--import'],240000],['export',['--export-release','Android Login',apk],1200000]]) {
   const result=spawnSync(executable,['--headless','--path',project,...args],{env:buildEnv,encoding:'utf8',timeout,maxBuffer:8*1024*1024});
   assert.ok(!result.error&&result.status===0,'Godot '+label+' failed; no release published');
  }
  const tools=join(request.sdkRoot,'build-tools',versions.buildTools);
  const badging=checked(join(tools,'aapt'),['dump','badging',apk],buildEnv);
  const manifest=checked(join(tools,'aapt'),['dump','xmltree',apk,'AndroidManifest.xml'],buildEnv);
  const signature=checked(join(tools,'apksigner'),['verify','--verbose','--print-certs',apk],buildEnv);
  const entries=run('unzip',['-Z1',apk]).split('\n');
  const identity=validateLoginArtifact({badging,manifest,signature,entries,expectedFingerprint:signer.expectedFingerprint});
  assert.match(manifest,/screenOrientation.*0x0/);
  const packed=checked('unzip',['-p',apk,'assets/override.cfg'],buildEnv);
  assertPackagedBuildRevision(packed,revision);
  const association=await verifyLiveAssetlinks({packageName:loginPackage,fingerprint:signer.expectedFingerprint});
  assert.equal((await androidReport()).treeSha256,baseline.treeSha256,'Preview SDK changed');
  const evidence={schemaVersion:1,sourceRevision:revision,apkSha256:await digest(apk),packageName:identity.packageName,signerSha256:signer.expectedFingerprint,assetlinks:association,device:'unverified',toolchainLockSha256:await digest(join(repo,'config/godot-toolchain.lock.json'))};
  const staging=await mkdtemp(join(request.outputDirectory,'.signed-login-'));
  try {
   await copyFile(apk,join(staging,LOGIN_APK_FILENAME));
   await writeFile(join(staging,'build-evidence.json'),JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
   await rename(staging,destination);
  } finally {await rm(staging,{recursive:true,force:true});}
  console.log('SIGNED LOGIN APK VERIFIED / DEVICE UNVERIFIED: '+destination);
  return evidence;
 } finally {await rm(job,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await signedLoginExport();
