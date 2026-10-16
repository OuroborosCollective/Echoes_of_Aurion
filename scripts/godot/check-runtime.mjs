import { spawnSync } from 'node:child_process';

// Godot can report resource/script errors while still returning exit status 0.
export function execute(file, args, { cwd, marker, timeout = 60000 } = {}) {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const failed = !!result.error || result.status !== 0 || /(?:SCRIPT ERROR:|\bERROR:)/.test(output) || (!!marker && !output.includes(marker));
  return { passed: !failed, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, output };
}
