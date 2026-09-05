#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const MAX_BYTES = 24 * 1024 * 1024;
export async function readAsset(filename) {
  if (!/\.glb$/i.test(filename)) throw new Error('GLB_EXTENSION_REQUIRED');
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size < 28 || before.size > MAX_BYTES) throw new Error('GLB_SIZE_INVALID');
    const bytes = await file.readFile();
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size) throw new Error('GLB_FILE_CHANGED');
    if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB_HEADER_INVALID');
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { await file.close(); }
}

export async function importAsset(filename, token, { dryRun = false, fetcher = fetch } = {}) {
  const { bytes, sha256 } = await readAsset(filename);
  const request = async (endpoint, body) => {
    const response = await fetcher(`https://arelogic.space/api/admin/glb-import/${endpoint}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GLB_HTTP_${response.status}`);
    return response.json();
  };
  const contentBase64 = bytes.toString('base64');
  const plan = await request('plan', { contentBase64 });
  if (plan.version !== 'aurion.glb-import.v1' || plan.sha256 !== sha256 || plan.bytes !== bytes.length || !/^[a-f0-9]{64}$/.test(plan.planSha256)) throw new Error('GLB_PLAN_READBACK_FAILED');
  if (dryRun) return { dryRun: true, sha256, targetKey: plan.targetKey, planSha256: plan.planSha256 };
  const displayName = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').slice(0, 120).padEnd(3, ' ');
  const receipt = await request('apply', { displayName, contentBase64, expectedPlanSha256: plan.planSha256 });
  if (receipt.sha256 !== sha256 || receipt.bytes !== bytes.length || receipt.planSha256 !== plan.planSha256 || !['assigned', 'catalog', 'conflict', 'archived'].includes(receipt.status)) throw new Error('GLB_IMPORT_READBACK_FAILED');
  return receipt;
}

async function main(args) {
  if (!args.length || args.includes('--help')) {
    process.stdout.write('Usage: node scripts/glb-import.mjs [--dry-run] [--watch DIRECTORY | FILE.glb ...]\nAuth: AURION_GLB_TOKEN_FILE (0600) or AURION_GLB_BEARER_TOKEN; Admin GLB session from /ops/glb-upload, or OAuth admin read + assets.write scopes.\nWatch scans stable GLBs every 2 seconds; conflicts never replace active models automatically.\n'); return;
  }
  let token = process.env.AURION_GLB_BEARER_TOKEN;
  if (process.env.AURION_GLB_TOKEN_FILE) {
    const file = await open(process.env.AURION_GLB_TOKEN_FILE, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 16_384 || (info.mode & 0o077)) throw new Error('GLB_TOKEN_FILE_MUST_BE_PRIVATE');
      token = (await file.readFile('utf8')).trim();
    } finally { await file.close(); }
  }
  if (!token || /\s/.test(token)) throw new Error('GLB_BEARER_TOKEN_REQUIRED');
  const dryRun = args.includes('--dry-run');
  const files = args.filter(value => value !== '--dry-run');
  const run = async filename => {
    const receipt = await importAsset(filename, token, { dryRun });
    process.stdout.write(`${JSON.stringify({ file: path.basename(filename), ...receipt })}\n`);
    return receipt;
  };
  if (files[0] !== '--watch') {
    if (files.some(value => value.startsWith('--'))) throw new Error('GLB_ARGUMENT_INVALID');
    for (const filename of files) {
      const receipt = await run(filename);
      if (receipt.status === 'conflict' || receipt.status === 'archived') process.exitCode = 2;
    }
    return;
  }
  if (files.length !== 2 || !(await stat(files[1])).isDirectory()) throw new Error('GLB_WATCH_DIRECTORY_REQUIRED');
  const signatures = new Map(); const processed = new Set(); const retries = new Map();
  let running = true;
  process.once('SIGINT', () => { running = false; }); process.once('SIGTERM', () => { running = false; });
  while (running) {
    const entries = (await readdir(files[1], { withFileTypes: true })).filter(entry => entry.isFile() && /\.glb$/i.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (!running) break;
      const filename = path.join(files[1], entry.name);
      try {
        const info = await stat(filename); const signature = `${info.size}:${info.mtimeMs}`;
        if (signatures.get(filename) !== signature) { signatures.set(filename, signature); continue; }
        const { sha256 } = await readAsset(filename);
        if (processed.has(sha256) || (retries.get(sha256) ?? 0) >= 3) continue;
        retries.set(sha256, (retries.get(sha256) ?? 0) + 1);
        await run(filename); processed.add(sha256);
      } catch (error) {
        const code = error instanceof Error && /^GLB_[A-Z_0-9]+$/.test(error.message) ? error.message : 'GLB_IMPORT_FAILED';
        process.stderr.write(`${JSON.stringify({ file: entry.name, error: code })}\n`);
        if (/GLB_HTTP_40[13]/.test(code)) throw new Error(code);
      }
    }
    if (running) await delay(2000);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error && /^GLB_[A-Z_0-9]+$/.test(error.message) ? error.message : 'GLB_IMPORT_FAILED'}\n`);
    process.exitCode = 1;
  });
}
