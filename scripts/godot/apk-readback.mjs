import assert from 'node:assert/strict';

export const previewPackage = 'org.ouroboroscollective.aurion.godot.preview';
export const loginPackage = 'org.ouroboroscollective.aurion.godot.login';
export const previewIdentity = Object.freeze({packageName: previewPackage, label: 'Aurion Preview', versionName: '0.1.0-preview'});
export const loginIdentity = Object.freeze({packageName: loginPackage, label: 'Aurion Login', versionName: '0.1.0-login'});
export function validateApk(badging, signature, entries, manifest, identity = previewIdentity) {
  assert.ok(identity === previewIdentity || identity === loginIdentity, 'unknown Android build identity');
  assert.match(badging, new RegExp(`package: name='${identity.packageName.replaceAll('.', '\\.')}'.*versionCode='1'.*versionName='${identity.versionName}'`));
  // aapt 35 badging omits launchable-activity for Godot 4.7's activity-alias.
  // Verify the exported alias and its concrete target in the actual manifest.
  const blocks = manifest.split(/(?=^ {6}E: )/m);
  const launcher = blocks.find(block => block.includes('E: activity-alias') && block.includes('android.intent.action.MAIN') && block.includes('android.intent.category.LAUNCHER'));
  assert.ok(launcher, 'MAIN/LAUNCHER alias missing');
  assert.match(launcher, /android:exported[^\n]*0xffffffff/);
  const target = launcher.match(/android:targetActivity[^\n]*="([^"]+)"/);
  assert.ok(target, 'launcher target missing');
  const activities = blocks.filter(block => block.startsWith('      E: activity ('));
  assert.ok(activities.some(block => block.match(/android:name[^\n]*="([^"]+)"/)?.[1] === target[1]), 'launcher target activity missing');
  assert.ok(badging.includes(`application-label:'${identity.label}'`), 'wrong Android app label');
  assert.match(badging, /uses-permission: name='android.permission.INTERNET'/);
  const permissions = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map(x => x[1]);
  assert.deepEqual(permissions, ['android.permission.INTERNET'], 'unexpected Android permission');
  assert.match(badging, /native-code: 'arm64-v8a'\s*$/m);
  // Godot 4.7.2 prebuilt template: platform/android/java/app/config.gradle.
  assert.match(badging, /sdkVersion:'24'/);
  assert.match(badging, /targetSdkVersion:'36'/);
  assert.match(signature, /Verified using v2 scheme.*true/);
  const fingerprint = signature.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/);
  assert.ok(fingerprint, 'signing certificate missing');
  assert.ok(entries.includes('lib/arm64-v8a/libgodot_android.so'), 'ARM64 engine absent');
  assert.ok(!entries.some(path => /^lib\/(?!arm64-v8a\/)/.test(path)), 'unexpected ABI');
  return { package: identity.packageName, certificateSha256: fingerprint[1], minSdk: Number(badging.match(/sdkVersion:'([0-9]+)'/)[1]), targetSdk: 36, abi: 'arm64-v8a' };
}
