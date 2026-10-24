import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectGlb, inventory } from './audit-assets.mjs';
import { repo } from './toolchain.mjs';

const DEFAULT_OUTPUT = resolve(repo, 'godot-client/assets/generated');
const TEST_OUTPUT_ROOT = resolve(repo, '.aurion-godot');
const PROFILE_PATH = resolve(repo, 'godot-client/assets/import_profiles.json');

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function repositoryPath(path) {
  const value = relative(repo, path).split(sep).join('/');
  assert.ok(value && value !== '..' && !value.startsWith('../'), 'OUTPUT_OUTSIDE_REPOSITORY');
  return value;
}

function validateOutputDirectory(output) {
  const testRelative = relative(TEST_OUTPUT_ROOT, output);
  const isolatedTestOutput = testRelative && testRelative !== '..' && !testRelative.startsWith(`..${sep}`);
  assert.ok(output === DEFAULT_OUTPUT || isolatedTestOutput, 'OUTPUT_DIRECTORY_NOT_ALLOWED');
}

function validateProfiles(document) {
  assert.equal(document.schemaVersion, 'aurion.godot-import-profiles.v1', 'PROFILE_SCHEMA');
  assert.ok(document.profiles && typeof document.profiles === 'object', 'PROFILES_REQUIRED');
  assert.ok(document.profiles[document.defaultProfile], 'DEFAULT_PROFILE_REQUIRED');
  for (const [id, profile] of Object.entries(document.profiles)) {
    assert.match(id, /^[a-z0-9-]+$/, 'PROFILE_ID');
    assert.equal(profile.operation, 'byte-exact-copy', 'UNVERIFIED_PROFILE_OPERATION');
    assert.equal(profile.requiredExtensions, 'reject', 'REQUIRED_EXTENSION_POLICY');
    assert.equal(profile.compression, 'none', 'UNVERIFIED_COMPRESSION');
    assert.equal(profile.scale, 1, 'UNVERIFIED_SCALE');
    assert.equal(profile.axes, 'source', 'UNVERIFIED_AXES');
    assert.equal(profile.pivot, 'preserve', 'UNVERIFIED_PIVOT');
    assert.ok(Array.isArray(profile.preserve) && profile.preserve.includes('animations') && profile.preserve.includes('skins'), 'PRESERVATION_POLICY');
  }
  return document;
}

async function atomicWrite(path, bytes) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

export async function prepareAssets({ outputDirectory = DEFAULT_OUTPUT } = {}) {
  const output = resolve(outputDirectory);
  repositoryPath(output);
  validateOutputDirectory(output);
  const [sourceInventory, profileBytes] = await Promise.all([
    inventory(),
    readFile(PROFILE_PATH),
  ]);
  const profiles = validateProfiles(JSON.parse(profileBytes));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const prepared = [];
  const outputNames = new Set();
  for (const source of sourceInventory.sources) {
    const profileId = profiles.roleProfiles[source.role] ?? profiles.defaultProfile;
    const profile = profiles.profiles[profileId];
    assert.ok(profile, `PROFILE_MISSING: ${source.role}`);
    assert.deepEqual(source.extensionsRequired, [], `REQUIRED_GLTF_EXTENSION: ${source.path}`);
    const sourceBytes = await readFile(resolve(repo, source.path));
    assert.equal(sha256(sourceBytes), source.sha256, `SOURCE_HASH_CHANGED: ${source.path}`);
    const outputName = `${source.assetId}.glb`;
    assert.equal(outputNames.has(outputName), false, `DUPLICATE_OUTPUT: ${outputName}`);
    outputNames.add(outputName);
    const outputPath = resolve(output, outputName);
    await atomicWrite(outputPath, sourceBytes);
    const outputBytes = await readFile(outputPath);
    const outputInspection = inspectGlb(outputBytes);
    assert.equal(outputInspection.sha256, source.sha256, `OUTPUT_HASH_CHANGED: ${source.path}`);
    for (const key of ['bytes', 'triangles', 'meshes', 'materials']) assert.equal(outputInspection[key], source[key], `OUTPUT_${key.toUpperCase()}_CHANGED: ${source.path}`);
    assert.deepEqual(outputInspection.skins, source.skins, `OUTPUT_SKINS_CHANGED: ${source.path}`);
    assert.deepEqual(outputInspection.animations, source.animations, `OUTPUT_ANIMATIONS_CHANGED: ${source.path}`);
    prepared.push({
      ...source,
      path: repositoryPath(outputPath),
      sourcePath: source.path,
      sourceSha256: source.sha256,
      outputSha256: outputInspection.sha256,
      profileId,
      profileHash: sha256(Buffer.from(JSON.stringify(profile))),
    });
  }
  const manifest = {
    schemaVersion: 'aurion.godot-prepared-assets.v1',
    sourceRevision: sourceInventory.sourceRevision,
    sourceManifestHash: sha256(await readFile(resolve(repo, 'godot-client/assets/catalog/source-manifest.json'))),
    toolchainHash: sourceInventory.toolchainHash,
    profileDocumentHash: sha256(profileBytes),
    outputMode: 'byte-exact-compatible-copy',
    sources: prepared,
    truthNotice: 'Generated compatibility outputs only. No live assignment, gameplay authority, compression, simplification or physical-device claim.',
  };
  const manifestPath = resolve(output, 'manifest.json');
  await atomicWrite(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return { manifest, manifestPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { manifest, manifestPath } = await prepareAssets();
  console.log(JSON.stringify({ manifest: repositoryPath(manifestPath), assets: manifest.sources.length, profileDocumentHash: manifest.profileDocumentHash }));
}
