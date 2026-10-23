import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const KEYS = ['compileSdk', 'buildTools', 'ndkVersion'];

/** Extract exactly one upstream Gradle declaration of every required SDK version. */
export function parseGodotGradleVersions(config) {
 assert.equal(typeof config, 'string', 'Gradle config must be text');
 const result = {};
 for (const key of KEYS) {
  const candidates = config.split(/\r?\n/).filter(line => new RegExp('^\\s*'+key+'\\s*:').test(line));
  assert.equal(candidates.length, 1, key+' must occur exactly once');
  const match = candidates[0].match(new RegExp(String.raw`^\s*${key}\s*:\s*(?:'([^']+)'|"([^"]+)"|([0-9]+))\s*,?\s*(?://.*)?$`));
  assert.ok(match, key+' invalid declaration');
  const value = match[1] ?? match[2] ?? match[3];
  if (key === 'compileSdk') {
   assert.match(value, /^\d+$/, key+' invalid integer');
   result[key] = Number(value);
   assert.ok(Number.isSafeInteger(result[key]) && result[key] > 0);
  } else {
   assert.match(value, /^\d+(?:\.\d+){1,3}$/, key+' invalid version');
   result[key] = value;
  }
 }
 return result;
}

/** Version declaration only: not a license, installed SDK, APK, or device proof. */
export function verifyGodotGradleVersions(config, expected) {
 const found = parseGodotGradleVersions(config);
 for (const key of KEYS) {
  assert.ok(expected && Object.hasOwn(expected, key), key+' has no locked requirement');
  assert.equal(found[key], expected[key], key+' version mismatch');
 }
 return found;
}

async function assertRegularFile(path) {
 const stat = await lstat(path);
 assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'required regular file absent: '+path);
}
async function readRegularFile(path) {
 await assertRegularFile(path);
 return readFile(path, 'utf8');
}
function oneProperty(content, key) {
 // Android NDK source.properties uses "Pkg.Revision = <version>" with spaces.
 // Preserve exact-key, single-declaration and locked-version checks.
 const rows = content.split(/\r?\n/).filter(row => {
  const separator = row.indexOf('=');
  return separator >= 0 && row.slice(0, separator).trim() === key;
 });
 assert.equal(rows.length, 1, key+' must appear once in SDK metadata');
 return rows[0].slice(rows[0].indexOf('=')+1).trim();
}

/** Check a separately provisioned SDK without modifying the old Preview toolchain. */
export async function inspectLoginGradleSdk(sdkRoot, expected) {
 assert.ok(isAbsolute(sdkRoot), 'absolute operator Gradle SDK root required');
 const {compileSdk, buildTools, ndkVersion} = expected;
 assert.ok(Number.isInteger(compileSdk) && compileSdk > 0);
 assert.match(buildTools, /^\d+(?:\.\d+){1,3}$/);
 assert.match(ndkVersion, /^\d+(?:\.\d+){1,3}$/);
 const platform = join(sdkRoot, 'platforms', 'android-'+compileSdk);
 const build = join(sdkRoot, 'build-tools', buildTools);
 const ndk = join(sdkRoot, 'ndk', ndkVersion);
 const platformText = await readRegularFile(join(platform,'source.properties'));
 assert.equal(oneProperty(platformText,'AndroidVersion.ApiLevel'),String(compileSdk),'Android platform version mismatch');
 await assertRegularFile(join(platform,'android.jar'));
 const buildText = await readRegularFile(join(build,'source.properties'));
 assert.equal(oneProperty(buildText,'Pkg.Revision'),buildTools,'Build Tools version mismatch');
 await assertRegularFile(join(build,'aapt'));
 await assertRegularFile(join(build,'apksigner'));
 const ndkText = await readRegularFile(join(ndk,'source.properties'));
 assert.equal(oneProperty(ndkText,'Pkg.Revision'),ndkVersion,'NDK version mismatch');
 return {status:'ready',versions:{compileSdk,buildTools,ndkVersion},device:'unverified',licenses:'unverified',signer:'unverified'};
}
