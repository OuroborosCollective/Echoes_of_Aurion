import assert from 'node:assert/strict';
import { lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { previewPackage, loginPackage, loginIdentity, validateApk } from './apk-readback.mjs';
export { loginPackage };
import { requireLoginSigner } from './android-gradle-link.mjs';

export const callbackUrl='https://arelogic.space/app/auth/callback';

/** Dedicated Gradle-release preset in a disposable project; existing Preview is byte-identical. */
export function createLoginPreset(preview) {
 assert.equal(typeof preview,'string');
 assert.match(preview,/^\[preset\.0\]\s*\nname="Android Preview"/);
 assert.ok(!preview.includes('[preset.1]'),'Android Login preset already exists');
 for (const required of [
  '[preset.0.options]', 'gradle_build/use_gradle_build=false',
  'package/unique_name="'+previewPackage+'"', 'package/name="Aurion Preview"', 'version/name="0.1.0-preview"', 'package/signed=true',
  'include_filter="net/contracts/*.json,override.cfg"',
  'architectures/arm64-v8a=true',
 ]) assert.ok(preview.includes(required),'Preview input missing '+required);
 const replacement=preview.replaceAll('[preset.0]','[preset.1]')
  .replaceAll('[preset.0.options]','[preset.1.options]')
  .replace('name="Android Preview"','name="Android Login"')
  .replace('gradle_build/use_gradle_build=false','gradle_build/use_gradle_build=true')
  .replace('package/unique_name="'+previewPackage+'"','package/unique_name="'+loginPackage+'"')
  .replace('package/name="Aurion Preview"','package/name="Aurion Login"')
  .replace('version/name="0.1.0-preview"','version/name="0.1.0-login"');
 assert.ok(!replacement.includes('gradle_build/use_gradle_build=false'));
 return preview+(preview.endsWith('\n')?'':'\n')+'\n'+replacement;
}

/** Non-ephemeral signing identity: upstream Gradle uses storePass for keyPass. */
export function validateSignerConfig(env) {
 const cfg=requireLoginSigner(env);
 assert.equal(env.AURION_LOGIN_KEY_PASSWORD,env.AURION_LOGIN_KEYSTORE_PASSWORD,
  'Godot Gradle requires the same password for store and key');
 return {...cfg,expectedFingerprint:cfg.expectedFingerprint.toUpperCase()};
}

export async function verifySignerOnDisk(env, keytoolPath) {
 const signer=validateSignerConfig(env);
 const file=await lstat(signer.keystorePath);
 assert.ok(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0,
  'release keystore must be private (mode 0600/0400)');
 const processResult=spawnSync(keytoolPath,['-list','-v','-keystore',signer.keystorePath,
  '-alias',signer.alias,'-storepass:env','AURION_LOGIN_KEYSTORE_PASSWORD'],
  {env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.ok(!processResult.error && processResult.status===0,'release keystore alias validation failed');
 const found=processResult.stdout.match(/SHA256:\s*((?:[0-9A-F]{2}:){31}[0-9A-F]{2})/i);
 assert.ok(found,'release certificate fingerprint not readable');
 assert.equal(found[1].toUpperCase(),signer.expectedFingerprint,'operator expected signer does not match key material');
 return {alias:signer.alias,certificateSha256:signer.expectedFingerprint};
}

/** aapt/apksigner readback from the actual APK; OS and live domain still unverified. */
export function validateLoginArtifact({badging,manifest,signature,entries,expectedFingerprint}) {
 assert.match(expectedFingerprint,/^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/);
 const identity=validateApk(badging,signature,entries,manifest,loginIdentity);
 const expectedHex=expectedFingerprint.replaceAll(':','').toLowerCase();
 assert.equal(identity.certificateSha256,expectedHex,'APK signer differs from persisted identity');
 assert.ok(entries.includes('assets/override.cfg'),'source revision asset missing');
 assert.ok(!entries.some(name=>name.startsWith('assets/tests/')),'test sources included in APK');
 const aliasBlocks=manifest.split(/(?=^ {6}E: )/m).filter(x=>x.startsWith('      E: activity-alias ('));
 assert.equal(aliasBlocks.length,1,'unexpected number of Android launcher aliases');
 const alias=aliasBlocks[0];
 const filters=alias.split(/(?=^ {8}E: intent-filter)/m).slice(1);
 const matching=filters.filter(x=>x.includes('android.intent.action.VIEW'));
 assert.equal(matching.length,1,'expected exactly one VIEW App Link intent');
 const filter=matching[0];
 for(const expected of [
  /android:autoVerify[^\n]*0xffffffff/,
  /android.intent.category.DEFAULT/,
  /android.intent.category.BROWSABLE/,
  /android:scheme[^\n]*"https"/,
  /android:host[^\n]*"arelogic.space"/,
  /android:path[^\n]*"\/app\/auth\/callback"/,
 ]) assert.match(filter,expected,'packaged verified App Link incomplete');
 return {packageName:identity.package,certificateSha256:expectedFingerprint.toUpperCase(),
  callback:callbackUrl,sourceRevision:'packaged-override-to-be-checked',
  domainAssociation:'unverified',device:'unverified'};
}
