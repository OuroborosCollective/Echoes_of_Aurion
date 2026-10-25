import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repo, root } from './toolchain.mjs';

test('actual failed actor reruns cannot publish stale success receipts', async () => {
  const directory = join(root, 'actor-evidence');
  await mkdir(directory, { recursive: true });
  const outputs = ['headless.json', 'headless.log', 'import.log', 'render.json', 'render.log', 'actors.png', 'world-view.png', 'world-viewport.png', 'quest-npcs.png'];
  for (const render of [true, false]) {
    for (const file of outputs) await writeFile(join(directory, file), 'stale-success-sentinel');
    const result = spawnSync(process.execPath, ['scripts/godot/actor-runtime.mjs', ...(render ? ['--render'] : [])], {
      cwd: repo, env: { ...process.env, AURION_EXPECTED_REVISION: '0'.repeat(40) }, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ERR_ASSERTION/);
    assert.match(result.stderr, /0000000000000000000000000000000000000000/);
    for (const file of render ? ['render.json', 'render.log', 'actors.png', 'world-view.png', 'world-viewport.png', 'quest-npcs.png'] : outputs) {
      await assert.rejects(access(join(directory, file)), { code: 'ENOENT' });
    }
    if (render) assert.equal(await readFile(join(directory, 'headless.json'), 'utf8'), 'stale-success-sentinel');
  }
});
