import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo, root, executable, lock, digest, run } from './toolchain.mjs';
import { androidReport } from './android-toolchain.mjs';
import { execute } from './check-runtime.mjs';
import { validateApk } from './apk-readback.mjs';
import { stageAssetProject, includeAssetManifest, verifyStagedAssetImports, readApkAssets } from './export-assets.mjs';
import { readTerrain3dApk } from './terrain3d-apk-readback.mjs';

const revision = run('git', ['-C', repo, 'rev-parse', 'HEAD']);
run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
assert.equal(run('git', ['-C', repo, 'ls-files', '--others', '--exclude-standard', 'godot-client', 'scripts/godot']), '', 'commit source first');
if (process.env.AURION_EXPECTED_REVISION) assert.equal(revision, process.env.AURION_EXPECTED_REVISION);
// Verify before executing any installed tool; keep the SDK receipt immutable.
const doctor = execute(process.execPath, [join(repo, 'scripts/godot/doctor.mjs'), '--android']);
assert.ok(doctor.passed, doctor.output);
const android = await androidReport();
assert.equal(android.status, 'ready');
const installed = android.installation;
const output = resolve(process.env.AURION_APK_OUTPUT || join(root, 'apk', revision));
await mkdir(output, { recursive: true });
await rm(join(output, 'build-evidence.json'), { force: true });
const job = await mkdtemp(join(root, 'export-'));
try {
  const project = join(job, 'project');
  const prepared = await stageAssetProject(project, revision, { includeTerrain3D: true });
  const presets = await readFile(join(project, 'export_presets.cfg'), 'utf8');
  await writeFile(join(project, 'export_presets.cfg'), includeAssetManifest(presets));
  await writeFile(join(project, 'override.cfg'), `[aurion]\nclient_build="${revision}"\n`);
  const config = join(job, 'config/godot');
  const data = join(job, 'data/godot');
  await mkdir(config, { recursive: true });
  await mkdir(data, { recursive: true });
  await symlink(join(installed, 'data/godot/export_templates'), join(data, 'export_templates'));
  const settings = `[gd_resource type="EditorSettings" format=3]\n\n[resource]\nexport/android/java_sdk_path = ${JSON.stringify(join(installed, 'jdk'))}\nexport/android/android_sdk_path = ${JSON.stringify(join(installed, 'sdk'))}\n`;
  await writeFile(join(config, 'editor_settings-4.7.tres'), settings);
  const keyDirectory = join(root, 'debug-signing');
  const key = join(keyDirectory, 'debug.keystore');
  await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
  try { await access(key); } catch {
    run(join(installed, 'jdk/bin/keytool'), ['-genkeypair', '-keystore', key, '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android', '-dname', 'CN=Android Debug,O=Android,C=US', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000']);
  }
  const env = { ...process.env, XDG_CONFIG_HOME: join(job, 'config'), XDG_DATA_HOME: join(job, 'data'), JAVA_HOME: join(installed, 'jdk'), GODOT_ANDROID_KEYSTORE_DEBUG_PATH: key, GODOT_ANDROID_KEYSTORE_DEBUG_USER: 'androiddebugkey', GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD: 'android' };
  const apk = join(output, 'Aurion-Preview.apk');
  async function godot(id, args) {
    const result = spawnSync(executable, ['--headless', '--path', project, ...args], { env, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    const log = `${result.stdout || ''}${result.stderr || ''}`;
    await writeFile(join(output, `${id}.log`), log);
    assert.ok(!result.error && result.status === 0 && !/(?:SCRIPT ERROR:|\bERROR:)/.test(log), `${id} failed: ${result.error?.message || log}`);
  }
  await godot('import', ['--editor', '--import']);
  await verifyStagedAssetImports(project, prepared, env);
  await godot('export', ['--export-debug', 'Android Preview', apk]);
  const buildTools = join(installed, 'sdk/build-tools', lock.android.buildTools);
  const badging = run(join(buildTools, 'aapt'), ['dump', 'badging', apk]);
  const manifest = run(join(buildTools, 'aapt'), ['dump', 'xmltree', apk, 'AndroidManifest.xml']);
  const signatureResult = spawnSync(join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', apk], { env, encoding: 'utf8', timeout: 60000 });
  assert.equal(signatureResult.status, 0, signatureResult.stderr);
  const signature = signatureResult.stdout;
  const entries = run('unzip', ['-Z1', apk]).split('\n');
  const identity = validateApk(badging, signature, entries, manifest);
  const packagedAssets = readApkAssets(apk, prepared, entries);
  const packagedTerrain3D = await readTerrain3dApk(apk, prepared.terrain3d, entries);
  await writeFile(join(output, 'packaged-assets.json'), JSON.stringify(packagedAssets, null, 2) + '\n');
  assert.match(manifest, /screenOrientation.*0x0/, 'landscape not encoded in manifest');
  const override = run('unzip', ['-p', apk, 'assets/override.cfg']);
  assert.ok(override.includes(revision), 'source revision absent from packaged settings');
  assert.ok(!entries.some(path => path.startsWith('assets/tests/')), 'test scripts shipped');
  const readback = { 'badging.log': badging, 'manifest.log': manifest, 'signature.log': signature, 'entries.log': entries.join('\n'), 'packaged-build.log': override };
  for (const [file, text] of Object.entries(readback)) await writeFile(join(output, file), text);
  run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
  assert.equal((await androidReport()).status, 'ready', 'export changed the pinned toolchain');
  const evidence = { schemaVersion: 1, sourceRevision: revision, toolchainHash: await digest(join(repo, 'config/godot-toolchain.lock.json')), engine: lock.engine.version, editorHash: await digest(executable), androidTreeHash: android.treeSha256, identity, packagedAssets, packagedTerrain3D, apkSha256: await digest(apk), runtimeLayer: 'android-export-and-package-readback', device: 'unverified', sdkLicenses: 'unverified-no-sdkmanager-invoked', artifacts: {} };
  for (const file of ['Aurion-Preview.apk', 'import.log', 'export.log', 'packaged-assets.json', ...Object.keys(readback)]) evidence.artifacts[file] = await digest(join(output, file));
  await writeFile(join(output, 'build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`BUILD PASS / DEVICE UNVERIFIED: ${apk}`);
  console.log(JSON.stringify(evidence, null, 2));
} finally { await rm(job, { recursive: true, force: true }); }
