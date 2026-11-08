/**
 * Aurion -> Godot editor-only catalog mirror. No gameplay, persistence or catalog authority.
 * All assets come from Aurion's published approved catalog and immutable SHA URLs.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, statfs, unlink } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BASE = 'https://arelogic.space';
const DIRECTORY = 'assets/aurion-catalog-sync';
const MAX_GLB_BYTES = 24 * 1024 * 1024;
const MAX_ASSETS = 2000; // Physical LODs as well as primary approved models.
const MIN_FREE_BYTES = 1024 * 1024 * 1024;
const SKIP = new Set(['.godot', 'node_modules', '.git', '.aurion-godot']);

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
const assetUrl = sha => `/api/assets/glb/${sha}.glb`;

function glbBytes(bytes, sha, expectedSize = null) {
  assert.ok(Buffer.isBuffer(bytes), 'CATALOG_GLB_BUFFER_REQUIRED');
  assert.ok(bytes.length >= 20 && bytes.length <= MAX_GLB_BYTES, 'CATALOG_GLB_SIZE_INVALID');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF', 'CATALOG_GLB_MAGIC_INVALID');
  assert.equal(bytes.readUInt32LE(4), 2, 'CATALOG_GLB_VERSION_INVALID');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'CATALOG_GLB_LENGTH_INVALID');
  assert.ok(bytes.readUInt32LE(12) >= 2 && bytes.subarray(16, 20).toString('ascii') === 'JSON', 'CATALOG_GLB_JSON_CHUNK_REQUIRED');
  if (expectedSize !== null) assert.equal(bytes.length, expectedSize, 'CATALOG_GLB_BYTES_MISMATCH');
  assert.equal(sha256(bytes), sha, 'CATALOG_GLB_SHA_MISMATCH');
  return bytes.length;
}

export function approvedPhysicalAssets(catalog) {
  assert.equal(catalog?.version, 'aurion.glb-import.v1', 'CATALOG_VERSION_INVALID');
  assert.match(catalog.revision, shaPattern, 'CATALOG_REVISION_INVALID');
  assert.ok(Array.isArray(catalog.entries) && catalog.entries.length <= MAX_ASSETS, 'CATALOG_ENTRIES_INVALID');
  const map = new Map();
  const add = (raw, entry) => {
    assert.match(raw?.sha256, shaPattern, 'CATALOG_SHA_INVALID');
    assert.equal(raw.storageUrl, assetUrl(raw.sha256), 'CATALOG_URL_UNTRUSTED');
    assert.ok(raw.bytes == null || (Number.isSafeInteger(raw.bytes) && raw.bytes >= 20 && raw.bytes <= MAX_GLB_BYTES), 'CATALOG_BYTES_INVALID');
    const old = map.get(raw.sha256);
    if (old && old.bytes !== null && raw.bytes != null) assert.equal(old.bytes, raw.bytes, 'CATALOG_LOD_SIZE_CONFLICT');
    const metadata = { assetId: entry.assetId, assetType: entry.assetType, purpose: entry.purpose ?? 'auto' };
    if (old) {
      if (!old.references.some(r => r.assetId === metadata.assetId)) old.references.push(metadata);
      if (old.bytes === null) old.bytes = raw.bytes ?? null;
    } else map.set(raw.sha256, { sha256: raw.sha256, storageUrl: raw.storageUrl, bytes: raw.bytes ?? null, references: [metadata] });
  };
  for (const entry of catalog.entries) {
    assert.ok(typeof entry?.assetId === 'string' && /^glb_[a-f0-9]{48}$/.test(entry.assetId), 'CATALOG_ASSET_ID_INVALID');
    assert.ok(['character', 'enemy', 'weapon', 'armor', 'arena'].includes(entry.assetType), 'CATALOG_TYPE_INVALID');
    add(entry, entry);
    assert.ok(entry.lods === undefined || (Array.isArray(entry.lods) && entry.lods.length <= 4), 'CATALOG_LODS_INVALID');
    for (const lod of entry.lods ?? []) add(lod, entry);
  }
  assert.ok(map.size <= MAX_ASSETS, 'CATALOG_PHYSICAL_ASSET_LIMIT');
  return [...map.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
}

async function safeDir(dir) {
  const stat = await lstat(dir);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'CATALOG_DIRECTORY_UNSAFE');
  assert.equal(await realpath(dir), dir, 'CATALOG_DIRECTORY_NOT_CANONICAL');
}

async function ensureManagedDir(project) {
  await safeDir(project);
  const assets = join(project, 'assets');
  await mkdir(assets, { recursive: true, mode: 0o755 });
  await safeDir(assets);
  const managed = join(assets, 'aurion-catalog-sync');
  await mkdir(managed, { recursive: true, mode: 0o755 });
  await safeDir(managed);
  return managed;
}

async function scanExisting(project, managed) {
  const found = new Map();
  let inspected = 0;
  async function walk(folder) {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const full = join(folder, entry.name);
      if (entry.isDirectory()) { if (!SKIP.has(entry.name)) await walk(full); continue; }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.glb')) continue;
      inspected++;
      assert.ok(inspected <= 12000, 'CATALOG_LOCAL_SCAN_LIMIT');
      const bytes = await readFile(full);
      if (bytes.length > MAX_GLB_BYTES || bytes.length < 20) continue;
      const digest = sha256(bytes);
      const destination = 'res://' + relative(project, full).split(sep).join('/');
      if (!found.has(digest) || (full.startsWith(managed + sep) && !found.get(digest).startsWith('res://' + DIRECTORY))) found.set(digest, destination);
    }
  }
  await walk(project);
  return found;
}

export async function atomicWrite(target, bytes) {
  const temporary = join(resolve(target, '..'), '.' + basename(target) + '.' + process.pid + '.tmp');
  const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally { await file.close(); }
    await rename(temporary, target);
  } catch (error) {
    // A failed write, sync or rename never leaves a temporary file behind.
    await unlink(temporary).catch(() => {});
    throw error;
  }
  const directory = await open(resolve(target, '..'), constants.O_RDONLY);
  try { await directory.sync(); } finally { await directory.close(); }
}

async function verifiedDownload(base, item, fetcher) {
  const url = new URL(item.storageUrl, base);
  assert.equal(url.origin, BASE, 'CATALOG_ASSET_ORIGIN_INVALID');
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'model/gltf-binary' } });
  assert.equal(response.status, 200, 'CATALOG_ASSET_HTTP_ERROR');
  const mime = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
  assert.ok(['model/gltf-binary', 'application/octet-stream'].includes(mime), 'CATALOG_ASSET_CONTENT_TYPE_INVALID');
  const declared = Number(response.headers.get('content-length') ?? 0);
  assert.ok(declared <= MAX_GLB_BYTES, 'CATALOG_ASSET_TOO_LARGE');
  const reader = response.body?.getReader();
  assert.ok(reader, 'CATALOG_ASSET_STREAM_MISSING');
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      assert.ok(total <= MAX_GLB_BYTES, 'CATALOG_ASSET_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const data = Buffer.concat(chunks);
  glbBytes(data, item.sha256, item.bytes);
  return data;
}

export async function synchronizeApprovedGlbs({ projectDirectory, fetcher = fetch, base = BASE } = {}) {
  assert.ok(typeof projectDirectory === 'string' && projectDirectory.startsWith('/'), 'CATALOG_PROJECT_ABSOLUTE_REQUIRED');
  assert.equal(base, BASE, 'CATALOG_SERVER_ORIGIN_LOCKED');
  const project = resolve(projectDirectory);
  await safeDir(project);
  // Write only into a project owned by the running account: no privilege boundary
  // is ever crossed, so a workspace user cannot redirect another account's writes.
  if (typeof process.getuid === 'function') assert.equal((await lstat(project)).uid, process.getuid(), 'CATALOG_PROJECT_OWNER_MISMATCH');
  const projectFile = await lstat(join(project, 'project.godot'));
  assert.ok(projectFile.isFile() && !projectFile.isSymbolicLink(), 'CATALOG_GODOT_PROJECT_REQUIRED');
  const response = await fetcher(BASE + '/api/game/glb-catalog', { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' } });
  assert.equal(response.status, 200, 'CATALOG_HTTP_ERROR');
  const catalog = await response.json();
  const physical = approvedPhysicalAssets(catalog);
  const managed = await ensureManagedDir(project);
  const local = await scanExisting(project, managed);
  let downloaded = 0, reused = 0;
  const models = [];
  for (const item of physical) {
    let resourcePath = local.get(item.sha256);
    if (resourcePath) reused++;
    else {
      const free = await statfs(managed);
      assert.ok(free.bavail * free.bsize >= MIN_FREE_BYTES + (item.bytes ?? MAX_GLB_BYTES), 'CATALOG_DISK_BUDGET_UNAVAILABLE');
      const target = join(managed, item.sha256 + '.glb');
      const existing = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      assert.ok(!existing || (existing.isFile() && !existing.isSymbolicLink()), 'CATALOG_DESTINATION_UNSAFE');
      const bytes = await verifiedDownload(base, item, fetcher);
      await atomicWrite(target, bytes);
      glbBytes(await readFile(target), item.sha256, item.bytes);
      resourcePath = 'res://' + DIRECTORY + '/' + item.sha256 + '.glb';
      local.set(item.sha256, resourcePath);
      downloaded++;
    }
    models.push({ sha256: item.sha256, bytes: item.bytes, resourcePath, references: item.references });
  }
  const manifest = { schema: 'aurion.godot-catalog-sync.v1', catalogRevision: catalog.revision, source: BASE + '/api/game/glb-catalog', physicalCount: models.length, downloaded, reused, models };
  await atomicWrite(join(managed, 'catalog-manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  return manifest;
}

function editorProjectFromSystemd(service) {
  assert.equal(service, 'serverin-aurion-godot-editor.service', 'CATALOG_EDITOR_SERVICE_INVALID');
  const directory = execFileSync('/usr/bin/systemctl', ['show', service, '--property', 'WorkingDirectory', '--value'], { encoding: 'utf8', timeout: 5000 }).trim();
  assert.ok(directory.startsWith('/srv/serverin/workspaces/') && directory.endsWith('/godot-client'), 'CATALOG_EDITOR_PROJECT_UNTRUSTED');
  return directory;
}

async function main() {
  // The mirror runs as the editor workspace owner (systemd User=), never as root.
  assert.notEqual(process.getuid?.(), 0, 'CATALOG_ROOT_FORBIDDEN');
  const argv = process.argv.slice(2);
  let project = null;
  if (argv.length === 2 && argv[0] === '--project') project = argv[1];
  else if (argv.length === 2 && argv[0] === '--project-from-service') project = editorProjectFromSystemd(argv[1]);
  else throw Error('CATALOG_USAGE_INVALID');
  const report = await synchronizeApprovedGlbs({ projectDirectory: project });
  process.stdout.write(JSON.stringify({ schema: report.schema, catalogRevision: report.catalogRevision, physicalCount: report.physicalCount, downloaded: report.downloaded, reused: report.reused }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const code = error instanceof Error && /^CATALOG_[A-Z0-9_]+$/.test(error.message) ? error.message : 'CATALOG_SYNC_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}
