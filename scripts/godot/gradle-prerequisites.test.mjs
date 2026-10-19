import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseGodotGradleVersions, verifyGodotGradleVersions, inspectLoginGradleSdk } from './gradle-prerequisites.mjs';

const expected = Object.freeze({compileSdk:36,buildTools:'36.1.0',ndkVersion:'29.0.14206865'});
const config = "ext.versions = [\n  androidGradlePlugin: '8.6.1',\n  compileSdk         : 36,\n  buildTools         : '36.1.0',\n  ndkVersion         : '29.0.14206865',\n]\n";

test('reads the exact Godot 4.7.2 upstream Gradle Android versions', () => {
 assert.deepEqual(parseGodotGradleVersions(config), expected);
 assert.deepEqual(verifyGodotGradleVersions(config, expected), expected);
});
test('fails closed for upstream Gradle version drift', () => {
 for (const changed of [config.replace('36.1.0', '35.0.1'),config.replace('29.0.14206865','28.1.13356709'),config.replace('compileSdk         : 36','compileSdk         : 35')]) {
  assert.throws(() => verifyGodotGradleVersions(changed, expected), /version mismatch/);
 }
});
test('fails closed for missing, duplicate, or nonnumeric keys', () => {
 assert.throws(() => parseGodotGradleVersions(config.replace(/.*buildTools.*\n/,'')), /exactly once/);
 assert.throws(() => parseGodotGradleVersions(config.replace('  compileSdk', '  compileSdk: 36,\n  compileSdk')), /exactly once/);
 assert.throws(() => parseGodotGradleVersions(config.replace('compileSdk         : 36','compileSdk         : something')), /invalid/);
});
async function fixture() {
 const sdk = await mkdtemp(join(tmpdir(),'aurion-gradle-sdk-'));
 const platform = join(sdk,'platforms/android-36'), tools = join(sdk,'build-tools/36.1.0'), ndk = join(sdk,'ndk/29.0.14206865');
 for (const p of [platform,tools,ndk]) await mkdir(p,{recursive:true});
 await writeFile(join(platform,'source.properties'),'AndroidVersion.ApiLevel=36\nPkg.Revision=2\n');
 await writeFile(join(platform,'android.jar'), 'unit fixture only');
 await writeFile(join(tools,'source.properties'),'Pkg.Revision=36.1.0\n');
 await writeFile(join(tools,'aapt'),'unit fixture only');
 await writeFile(join(tools,'apksigner'),'unit fixture only');
 await writeFile(join(ndk,'source.properties'),'Pkg.Revision=29.0.14206865\n');
 return {sdk,platform,tools,ndk};
}
test('installed versions, not folder names alone, decide Gradle SDK readiness',async t=>{
 const f=await fixture();t.after(()=>rm(f.sdk,{recursive:true,force:true}));
 const result=await inspectLoginGradleSdk(f.sdk,expected);
 assert.equal(result.status,'ready');
 assert.deepEqual(result.versions,expected);
 assert.equal(result.device,'unverified');
 assert.equal(result.licenses,'unverified');
});
test('rejects NDK manifest that contradicts directory name',async t=>{
 const f=await fixture();t.after(()=>rm(f.sdk,{recursive:true,force:true}));
 await writeFile(join(f.ndk,'source.properties'),'Pkg.Revision=28.1.13356709\n');
 await assert.rejects(inspectLoginGradleSdk(f.sdk, expected),/NDK version mismatch/);
});
test('rejects absent Android platform, build tools and certificate inspector',async t=>{
 const f=await fixture();t.after(()=>rm(f.sdk,{recursive:true,force:true}));
 await rm(join(f.platform,'android.jar'));
 await assert.rejects(inspectLoginGradleSdk(f.sdk, expected),/android.jar/);
 await writeFile(join(f.platform,'android.jar'),'unit fixture only');
 await rm(join(f.tools,'apksigner'));
 await assert.rejects(inspectLoginGradleSdk(f.sdk, expected),/apksigner/);
});
