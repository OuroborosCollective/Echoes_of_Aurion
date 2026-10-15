import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApk, previewPackage } from './apk-readback.mjs';
const badge = `package: name='${previewPackage}' versionCode='1' versionName='0.1.0-preview'\nlaunchable-activity: name='org.godotengine.godot.GodotApp'\napplication-label:'Aurion Preview'\nuses-permission: name='android.permission.INTERNET'\nnative-code: 'arm64-v8a'\nsdkVersion:'24'\ntargetSdkVersion:'36'`;
const signature = `Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${'a'.repeat(64)}`;
const entries = ['lib/arm64-v8a/libgodot_android.so'];
test('APK reader rejects wrong package, architecture, permission, SDK and signing evidence', () => {
  assert.equal(validateApk(badge, signature, entries).package, previewPackage);
  for (const broken of [badge.replace(previewPackage, 'org.other.app'), badge.replace('arm64-v8a', 'x86_64'), badge.replace('targetSdkVersion:\'36\'', 'targetSdkVersion:\'34\''), badge.replace('android.permission.INTERNET', 'android.permission.CAMERA'), badge + "\nuses-permission: name='android.permission.CAMERA'"]) assert.throws(() => validateApk(broken, signature, entries));
  assert.throws(() => validateApk(badge, signature.replace('true', 'false'), entries));
  assert.throws(() => validateApk(badge, signature, []));
  assert.throws(() => validateApk(badge, signature, [...entries, 'lib/x86_64/libgodot_android.so']));
});

import { readFile } from 'node:fs/promises';
test('classic export keeps template SDK defaults and includes build override', async () => {
  const preset = await readFile(new URL('../../godot-client/export_presets.cfg', import.meta.url), 'utf8');
  assert.ok(preset.includes('gradle_build/use_gradle_build=false'));
  assert.ok(!preset.includes('gradle_build/target_sdk='), 'SDK override requires Gradle and breaks classic export');
  assert.ok(preset.includes('override.cfg'), 'packaged build override missing');
});
