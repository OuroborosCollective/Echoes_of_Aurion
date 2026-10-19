import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareGradleLinkManifest, requireLoginSigner } from './android-gradle-link.mjs';

const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity-alias android:name=".GodotAppLauncher" android:targetActivity=".GodotApp" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN" /></intent-filter></activity-alias></application></manifest>`;

test('prepares exact Godot launcher https app-link without touching main intent', () => {
 const result = prepareGradleLinkManifest(manifest);
 assert.match(result, /android:autoVerify="true"/);
 assert.match(result, /android:host="arelogic.space"/);
 assert.match(result, /android:path="\/app\/auth\/callback"/);
 assert.equal(prepareGradleLinkManifest(result), result);
});
test('rejects absent, ambiguous and untrusted launcher', () => {
 assert.throws(() => prepareGradleLinkManifest('<manifest/>'));
 assert.throws(() => prepareGradleLinkManifest(manifest.replace('android:exported="true"', 'android:exported="false"')));
});
test('release signing requires persistent key path and expected SHA-256 identity', () => {
 const base={AURION_LOGIN_KEYSTORE_PATH:'/secured/aurion.jks',AURION_LOGIN_KEY_ALIAS:'aurion',AURION_LOGIN_KEYSTORE_PASSWORD:'a_long_password',AURION_LOGIN_KEY_PASSWORD:'a_long_password',AURION_LOGIN_SIGNER_SHA256:'AB:'.repeat(31)+'AB'};
 assert.deepEqual(requireLoginSigner(base).expectedFingerprint,base.AURION_LOGIN_SIGNER_SHA256);
 for (const key of Object.keys(base)) {const invalid={...base};delete invalid[key];assert.throws(()=>requireLoginSigner(invalid));}
 assert.throws(()=>requireLoginSigner({...base,AURION_LOGIN_KEYSTORE_PATH:'relative-file.jks'}));
});
