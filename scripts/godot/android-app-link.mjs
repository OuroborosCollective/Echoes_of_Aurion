import assert from 'node:assert/strict';

const callbackFilter = `<intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="arelogic.space"
                    android:path="/app/auth/callback" />
            </intent-filter>`;

/** Modify only the exported GodotAppLauncher alias; preserve MAIN/LAUNCHER. */
export function insertVerifiedLink(manifest) {
  assert.equal(typeof manifest,'string');
  const matches=[...manifest.matchAll(/<activity-alias\b[^>]*android:name="\.GodotAppLauncher"[^>]*>[\s\S]*?<\/activity-alias>/g)];
  assert.equal(matches.length,1,'exactly one GodotAppLauncher alias required');
  const alias=matches[0][0];
  assert.match(alias,/android:exported="true"/);
  assert.match(alias,/android:targetActivity="\.GodotApp"/);
  if(alias.includes('android:autoVerify="true"')) {
    assert.match(alias,/android:scheme="https"/);
    assert.match(alias,/android:host="arelogic.space"/);
    assert.match(alias,/android:path="\/app\/auth\/callback"/);
    return manifest;
  }
  assert.match(alias,/android.intent.action.MAIN/);
  const updated=alias.replace('</activity-alias>',callbackFilter+'\n        </activity-alias>');
  return manifest.replace(alias,updated);
}

/** Exact certificate and app identity matching; never infer identity from host or package alone. */
export function validateDomainAssociation(statements,packageName,certificateSha256) {
  if(!Array.isArray(statements)||!/^([a-zA-Z0-9_]+\.)+[a-zA-Z0-9_]+$/.test(packageName))return false;
  if(typeof certificateSha256!=='string'||!/^(?:[a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2}$/.test(certificateSha256))return false;
  const canonical=certificateSha256.toUpperCase();
  return statements.some(row=>row&&Array.isArray(row.relation)&&row.relation.includes('delegate_permission/common.handle_all_urls')&&
    row.target?.namespace==='android_app'&&row.target.package_name===packageName&&
    Array.isArray(row.target.sha256_cert_fingerprints)&&row.target.sha256_cert_fingerprints.some(value=>typeof value==='string'&&value.toUpperCase()===canonical));
}
