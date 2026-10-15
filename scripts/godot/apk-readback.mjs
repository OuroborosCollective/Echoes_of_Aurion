import assert from 'node:assert/strict';

export const previewPackage = 'org.ouroboroscollective.aurion.godot.preview';
export function validateApk(badging, signature, entries) {
  assert.match(badging, new RegExp(`package: name='${previewPackage.replaceAll('.', '\\.')}'.*versionCode='1'.*versionName='0.1.0-preview'`));
  assert.match(badging, /launchable-activity:/);
  assert.match(badging, /application-label:'Aurion Preview'/);
  assert.match(badging, /uses-permission: name='android.permission.INTERNET'/);
  const permissions = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map(x => x[1]);
  assert.deepEqual(permissions, ['android.permission.INTERNET'], 'unexpected Android permission');
  assert.match(badging, /native-code: 'arm64-v8a'\s*$/m);
  assert.match(badging, /sdkVersion:'[0-9]+'/);
  assert.match(badging, /targetSdkVersion:'35'/);
  assert.match(signature, /Verified using v2 scheme.*true/);
  const fingerprint = signature.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/);
  assert.ok(fingerprint, 'signing certificate missing');
  assert.ok(entries.includes('lib/arm64-v8a/libgodot_android.so'), 'ARM64 engine absent');
  assert.ok(!entries.some(path => /^lib\/(?!arm64-v8a\/)/.test(path)), 'unexpected ABI');
  return { package: previewPackage, certificateSha256: fingerprint[1], minSdk: Number(badging.match(/sdkVersion:'([0-9]+)'/)[1]), targetSdk: 35, abi: 'arm64-v8a' };
}
