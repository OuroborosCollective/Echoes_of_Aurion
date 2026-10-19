import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidReport } from './android-toolchain.mjs';
import { lock } from './toolchain.mjs';
import { prepareGradleLinkManifest, stageGodotGradleBuild } from './android-gradle-link.mjs';

const report = await androidReport();
assert.equal(report.status, 'ready', 'pinned Godot Android tools required');
const version = lock.engine.version.split('.stable.official')[0] + '.stable';
const zip = join(report.installation, 'data/godot/export_templates', version, 'android_source.zip');
const project = await mkdtemp(join(tmpdir(), 'aurion-g09-gradle-'));
try {
  const staged = await stageGodotGradleBuild({ archive: zip, project, version });
  assert.equal(staged.manifest, 'android/build/src/main/AndroidManifest.xml');
  const onDisk = await readFile(join(project, staged.manifest), 'utf8');
  assert.equal(prepareGradleLinkManifest(onDisk), onDisk, 'materialized launcher App Link not idempotent');
  assert.match(onDisk, /android:host="arelogic.space"/);
  assert.match(onDisk, /android:path="\/app\/auth\/callback"/);
  assert.equal(await readFile(join(project, 'android/.build_version'), 'utf8'), version + '\n');
  console.log('Pinned Godot Android Gradle template extracted, patched and read back PASS (no APK, signing or live domain verification)');
} finally {
  await rm(project, { recursive: true, force: true });
}
