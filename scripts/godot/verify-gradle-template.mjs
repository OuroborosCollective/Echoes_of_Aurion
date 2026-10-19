import assert from 'node:assert/strict';
import { join } from 'node:path';
import { androidReport } from './android-toolchain.mjs';
import { lock, run } from './toolchain.mjs';
import { prepareGradleLinkManifest } from './android-gradle-link.mjs';

const report=await androidReport();
assert.equal(report.status,'ready','pinned Godot Android tools required');
const zip=join(report.installation,'data/godot/export_templates',lock.engine.version.split('.stable.official')[0]+'.stable','android_source.zip');
const entries=run('unzip',['-Z1',zip]).split('\n');
const candidates=entries.filter(v=>v.endsWith('app/src/main/AndroidManifest.xml'));
assert.equal(candidates.length,1,'exactly one upstream Godot Gradle launcher manifest required; actual='+JSON.stringify(entries.filter(v=>v.includes('AndroidManifest.xml')).slice(0,12)));
const raw=run('unzip',['-p',zip,candidates[0]]);
const patched=prepareGradleLinkManifest(raw);
assert.notEqual(patched,raw,'Godot Gradle manifest missing verified callback');
assert.equal(prepareGradleLinkManifest(patched),patched,'manifest not idempotent');
console.log('Pinned Godot Gradle source manifest App Link staging contract PASS (APK and domain still unverified)');
