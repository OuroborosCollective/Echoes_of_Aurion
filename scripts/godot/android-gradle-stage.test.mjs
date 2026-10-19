import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stageGodotGradleBuild } from './android-gradle-link.mjs';

const version='4.7.2.stable';
const manifest='<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity-alias android:name=".GodotAppLauncher" android:targetActivity=".GodotApp" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/></intent-filter></activity-alias></application></manifest>';
async function makeFixture(badManifest=manifest) {
 const root=await mkdtemp(join(tmpdir(),'g09-template-'));
 const source=join(root,'upstream');
 const project=join(root,'project');
 await mkdir(join(source,'src/main'),{recursive:true});
 await mkdir(project);
 await writeFile(join(source,'src/main/AndroidManifest.xml'),badManifest);
 await writeFile(join(source,'build.gradle'),'// upstream template\n');
 await writeFile(join(source,'gradlew'),'#!/bin/sh\n');
 const zip=join(root,'android_source.zip');
 const z=spawnSync('zip',['-qr',zip,'src','build.gradle','gradlew'],{cwd:source,encoding:'utf8'});
 assert.equal(z.status,0,z.stderr);
 return {root,zip,project};
}
test('stages exact installed Godot android/build tree with patched launcher and matching version',async t=>{
 const f=await makeFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 const result=await stageGodotGradleBuild({archive:f.zip,project:f.project,version});
 const patched=await readFile(join(f.project,'android/build/src/main/AndroidManifest.xml'),'utf8');
 assert.ok(patched.includes('android:autoVerify="true"'));
 assert.ok(patched.includes('android:host="arelogic.space"'));
 assert.ok(patched.includes('android.intent.action.MAIN'));
 assert.equal((patched.match(/android:autoVerify=/g)||[]).length,1);
 assert.equal(await readFile(join(f.project,'android/.build_version'),'utf8'),version+'\n');
 assert.equal(await readFile(join(f.project,'android/build/.gdignore'),'utf8'),'');
 assert.equal(await readFile(join(f.project,'android/build/build.gradle'),'utf8'),'// upstream template\n');
 assert.equal((await readFile(join(f.root,'upstream/src/main/AndroidManifest.xml'),'utf8')),manifest,'input unchanged');
 assert.equal(result.manifest,'android/build/src/main/AndroidManifest.xml');
});
test('refuses existing build tree without overwriting it',async t=>{
 const f=await makeFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 await mkdir(join(f.project,'android/build'),{recursive:true});
 await writeFile(join(f.project,'android/build/sentinel.txt'),'do-not-touch');
 await assert.rejects(stageGodotGradleBuild({archive:f.zip,project:f.project,version}));
 assert.equal(await readFile(join(f.project,'android/build/sentinel.txt'),'utf8'),'do-not-touch');
});
test('rejects malformed launcher and restores clean project state',async t=>{
 const f=await makeFixture('<manifest/>');t.after(()=>rm(f.root,{recursive:true,force:true}));
 await assert.rejects(stageGodotGradleBuild({archive:f.zip,project:f.project,version}));
 assert.deepEqual(await readdir(f.project),['android']);
 assert.deepEqual(await readdir(join(f.project,'android')),[]);
});
test('refuses invalid version before staging',async t=>{
 const f=await makeFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 await assert.rejects(stageGodotGradleBuild({archive:f.zip,project:f.project,version:'4.7.2.stable.official.ed1daf0bf'}));
 assert.deepEqual(await readdir(f.project),[]);
});
test('rejects ZIP traversal before creating Android workspace',async t=>{
 const f=await makeFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 await writeFile(join(f.root,'escape.txt'),'must not unpack');
 const z=spawnSync('zip',['-q',f.zip,'../escape.txt'],{cwd:join(f.root,'upstream'),encoding:'utf8'});
 assert.equal(z.status,0,z.stderr);
 await assert.rejects(stageGodotGradleBuild({archive:f.zip,project:f.project,version}),/unsafe ZIP entry/);
 assert.deepEqual(await readdir(f.project),[]);
});
