import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = ['godot-android-build.yml', 'godot-headless.yml'];

function readWorkflow(name) {
  return readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
}

function eventBlock(source, name) {
  const header = source.split('\npermissions:\n', 1)[0].split('\n');
  const start = header.indexOf(`  ${name}:`);
  assert.ok(start >= 0, `Missing ${name} event`);
  const endOffset = header.slice(start + 1).findIndex(line => /^  [a-z_]+:\s*$/.test(line));
  return header.slice(start + 1, endOffset === -1 ? header.length : start + 1 + endOffset);
}

function watchedPaths(block) {
  const start = block.indexOf('    paths:');
  assert.ok(start >= 0, 'Missing paths allowlist');
  return block.slice(start + 1).filter(line => /^      - /.test(line)).map(line => line.trim().slice(2).replace(/^['"]|['"]$/g, ''));
}

for (const name of workflows) {
  test(`${name}: an exact main change automatically runs the existing checks`, () => {
    const source = readWorkflow(name);
    const push = eventBlock(source, 'push');
    const pull = eventBlock(source, 'pull_request');
    assert.ok(push.includes('    branches:') && push.includes('      - main'), 'Only main may auto-build');
    const paths = watchedPaths(push);
    assert.deepEqual(paths, watchedPaths(pull), 'Push and PR path scopes must stay identical');
    for (const required of ['godot-client/**', 'scripts/godot/**', 'config/godot-toolchain.lock.json', `.github/workflows/${name}`])
      assert.ok(paths.includes(required), `Missing ${required}`);
    assert.match(source, /  workflow_dispatch:\n/, 'Explicit manual fallback must remain');
    assert.doesNotMatch(source, /environment:\s*production|aurion\.probe\.gameplay-session-readback/, 'Preview must not enter privileged gameplay gate');
    assert.match(source, /node --test[^\n]*ci-autobuild-workflow\.test\.mjs/, 'CI must guard its own trigger contract');
  });
}
