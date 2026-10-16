import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const lock = JSON.parse(await readFile(resolve(repo, 'config/godot-toolchain.lock.json'), 'utf8'));
export const root = resolve(process.env.AURION_GODOT_WORKSPACE || resolve(repo, '.aurion-godot'));
export const executable = resolve(root, 'editor', lock.engine.file);
export async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export function run(file, args, timeout = 60000) {
  const result = spawnSync(file, args, { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${file}: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout.trim();
}
