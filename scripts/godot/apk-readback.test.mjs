import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApk, previewPackage } from './apk-readback.mjs';
import { createPreviewOverride, assertPackagedPreviewOverride } from './android-preview-gates.mjs';
import { createLoginOverride } from './login-release-gates.mjs';
const badge = `package: name='${previewPackage}' versionCode='1' versionName='0.1.0-preview'\nlaunchable-activity: name='org.godotengine.godot.GodotApp'\napplication-label:'Aurion Preview'\nuses-permission: name='android.permission.INTERNET'\nnative-code: 'arm64-v8a'\nsdkVersion:'24'\ntargetSdkVersion:'36'`;
const signature = `Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${'a'.repeat(64)}`;
const manifest = `      E: activity (line=1)
        A: android:name="com.godot.game.GodotApp"
      E: activity-alias (line=2)
        A: android:exported=(type 0x12)0xffffffff
        A: android:targetActivity="com.godot.game.GodotApp"
        E: intent-filter (line=3)
          A: android:name="android.intent.action.MAIN"
          A: android:name="android.intent.category.LAUNCHER"`;
const entries = ['lib/arm64-v8a/libgodot_android.so'];
test('APK reader rejects wrong package, architecture, permission, SDK and signing evidence', () => {
  assert.equal(validateApk(badge, signature, entries, manifest).package, previewPackage);
  for (const broken of [badge.replace(previewPackage, 'org.other.app'), badge.replace('arm64-v8a', 'x86_64'), badge.replace('targetSdkVersion:\'36\'', 'targetSdkVersion:\'34\''), badge.replace('android.permission.INTERNET', 'android.permission.CAMERA'), badge + "\nuses-permission: name='android.permission.CAMERA'"]) assert.throws(() => validateApk(broken, signature, entries, manifest));
  assert.throws(() => validateApk(badge, signature.replace('true', 'false'), entries, manifest));
  assert.throws(() => validateApk(badge, signature, [], manifest));
  assert.throws(() => validateApk(badge, signature, [...entries, 'lib/x86_64/libgodot_android.so'], manifest));
});

import { readFile } from 'node:fs/promises';
test('classic export keeps template SDK defaults and includes build override', async () => {
  const preset = await readFile(new URL('../../godot-client/export_presets.cfg', import.meta.url), 'utf8');
  assert.ok(preset.includes('gradle_build/use_gradle_build=false'));
  assert.ok(!preset.includes('gradle_build/target_sdk='), 'SDK override requires Gradle and breaks classic export');
  assert.ok(preset.includes('override.cfg'), 'packaged build override missing');
});

test('manifest reader requires an exported launcher alias with an existing activity', () => {
  for (const broken of ['', manifest.replace('0xffffffff', '0x0'), manifest.replace('category.LAUNCHER', 'category.HOME'), manifest.replace('E: activity (', 'E: service ('), manifest.replace('A: android:name="com.godot.game.GodotApp"', 'A: android:label="com.godot.game.GodotApp"')]) assert.throws(() => validateApk(badge, signature, entries, broken));
});

test('Preview APK is strictly offline while separate signed Login path remains enabled', () => {
  const rev = 'a'.repeat(40);
  const preview = createPreviewOverride(rev);
  assert.ok(preview.includes('native_auth_start_enabled=false'));
  assert.equal(assertPackagedPreviewOverride(preview, rev), rev);
  for (const bad of [preview.replace('false', 'true'), createLoginOverride(rev), '[aurion]\\nclient_build="' + rev + '"\\n', preview.replace(rev, 'b'.repeat(40))])
    assert.throws(() => assertPackagedPreviewOverride(bad, rev));
  assert.throws(() => createPreviewOverride('bad'));
  assert.ok(createLoginOverride(rev).includes('native_auth_start_enabled=true'));
});
