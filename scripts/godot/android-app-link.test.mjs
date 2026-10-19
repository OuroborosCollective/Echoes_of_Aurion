import test from 'node:test';
import assert from 'node:assert/strict';
import { insertVerifiedLink, validateDomainAssociation } from './android-app-link.mjs';

const base = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application>
<activity android:name=".GodotApp" android:exported="false" />
<activity-alias android:name=".GodotAppLauncher" android:targetActivity=".GodotApp" android:exported="true">
<intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
</activity-alias></application></manifest>`;
const fp='AB:'.repeat(31)+'AB';
const packageName='org.ouroboroscollective.aurion.godot.preview';
const statement=[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:packageName,sha256_cert_fingerprints:[fp]}}];

test('manifest adds only exact https verified callback to exported launcher alias',()=>{
 const result=insertVerifiedLink(base);
 assert.equal(insertVerifiedLink(result),result,'must be idempotent');
 assert.match(result,/android:autoVerify="true"/);
 assert.match(result,/android:scheme="https"/);
 assert.match(result,/android:host="arelogic.space"/);
 assert.match(result,/android:path="\/app\/auth\/callback"/);
 assert.match(result,/android.intent.category.BROWSABLE/);
 assert.equal((result.match(/android:autoVerify="true"/g)||[]).length,1);
});
test('fails closed if expected Godot launcher alias is missing or ambiguous',()=>{
 assert.throws(()=>insertVerifiedLink('<manifest/>'));
 assert.throws(()=>insertVerifiedLink(base.replace('</application>',base.match(/<activity-alias[\\s\\S]*?<\\/activity-alias>/)[0]+'</application>')));
});
test('requires exact package, SHA-256 and delegate permission on Digital Asset Links',()=>{
 assert.equal(validateDomainAssociation(statement,packageName,fp),true);
 assert.equal(validateDomainAssociation(statement,packageName,'CD:'.repeat(31)+'CD'),false);
 assert.equal(validateDomainAssociation(statement,'org.other.aurion',fp),false);
 assert.equal(validateDomainAssociation([{...statement[0],relation:['other']}],packageName,fp),false);
 assert.equal(validateDomainAssociation([{...statement[0],target:{...statement[0].target,namespace:'web'}}],packageName,fp),false);
 assert.equal(validateDomainAssociation({},packageName,fp),false);
});
