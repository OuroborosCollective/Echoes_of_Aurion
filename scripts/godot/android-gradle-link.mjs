import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { insertVerifiedLink } from './android-app-link.mjs';

/** Called on Godot's installed res://android/build/src/main/AndroidManifest.xml. */
export function prepareGradleLinkManifest(xml) {
 return insertVerifiedLink(xml);
}
/** Never create an ephemeral signer for native login. */
export function requireLoginSigner(env) {
 const required=['AURION_LOGIN_KEYSTORE_PATH','AURION_LOGIN_KEY_ALIAS','AURION_LOGIN_KEYSTORE_PASSWORD','AURION_LOGIN_KEY_PASSWORD','AURION_LOGIN_SIGNER_SHA256'];
 for(const key of required)assert.ok(typeof env[key]==='string' && env[key].length>0, key+' required');
 assert.ok(isAbsolute(env.AURION_LOGIN_KEYSTORE_PATH),'absolute operator keystore path required');
 assert.match(env.AURION_LOGIN_KEY_ALIAS,/^[A-Za-z0-9_.-]{2,80}$/);
 assert.match(env.AURION_LOGIN_SIGNER_SHA256,/^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/);
 return {keystorePath:env.AURION_LOGIN_KEYSTORE_PATH,alias:env.AURION_LOGIN_KEY_ALIAS,expectedFingerprint:env.AURION_LOGIN_SIGNER_SHA256};
}
import { mkdir, mkdtemp, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceManifest = 'src/main/AndroidManifest.xml';
function unzipChecked(args) {
 const proc = spawnSync('unzip', args, { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
 assert.ok(!proc.error && proc.status === 0, 'Godot Gradle template extraction failed');
 return proc.stdout.trim();
}
async function pathExists(path) {
 try { await lstat(path); return true; }
 catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** Install a disposable Godot Android Gradle template, matching Godot's own
 * android/build + android/.build_version layout, then patch the real manifest.
 * No APK is built or signed and no login release is enabled by this step.
 */
export async function stageGodotGradleBuild({archive, project, version}) {
 assert.ok(isAbsolute(archive) && isAbsolute(project), 'absolute archive and disposable project paths required');
 assert.match(version, /^\d+\.\d+\.\d+\.stable$/, 'exact Godot export template version required');
 const entries = unzipChecked(['-Z1', archive]).split('\n');
 assert.ok(entries.length > 2);
 assert.ok(entries.every(value => value && !value.startsWith('/') && !value.includes('\\') &&
   !value.replace(/\/$/, '').split('/').some(part => part === '..' || part === '.' || part === '')),
 'unsafe ZIP entry');
 for (const required of [sourceManifest, 'build.gradle', 'gradlew'])
   assert.equal(entries.filter(name => name === required).length, 1, required + ' must appear once');
 const android = join(project, 'android');
 const build = join(android, 'build');
 const versionFile = join(android, '.build_version');
 assert.ok(!await pathExists(build) && !await pathExists(versionFile), 'refuse overwriting installed Gradle template');
 await mkdir(android, { recursive: true });
 const staging = await mkdtemp(join(android, '.aurion-gradle-stage-'));
 let published = false;
 try {
   unzipChecked(['-oq', archive, '-d', staging]);
   const manifest = join(staging, sourceManifest);
   assert.ok((await lstat(manifest)).isFile(), 'extracted manifest must be regular file');
   const original = await readFile(manifest, 'utf8');
   const patched = prepareGradleLinkManifest(original);
   assert.notEqual(original, patched, 'upstream manifest must need a new App Link');
   assert.equal(prepareGradleLinkManifest(patched), patched, 'manifest patch must be idempotent');
   await writeFile(manifest, patched);
   assert.equal(await readFile(manifest, 'utf8'), patched, 'disk manifest readback mismatch');
   await writeFile(join(staging, '.gdignore'), '', { flag: 'wx' });
   assert.ok(!await pathExists(build) && !await pathExists(versionFile), 'concurrent template installation detected');
   await rename(staging, build);
   published = true;
   await writeFile(versionFile, version + '\n', { flag: 'wx' });
   return { manifest: 'android/build/' + sourceManifest, templateVersion: version };
 } catch (error) {
   if (published) await rm(build, { recursive: true, force: true });
   throw error;
 } finally {
   await rm(staging, { recursive: true, force: true });
 }
}
