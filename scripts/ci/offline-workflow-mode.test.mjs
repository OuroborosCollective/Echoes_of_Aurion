import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const offline = readFileSync('.github/workflows/aurion-local-test-pack.yml', 'utf8');
const schema = readFileSync('.github/workflows/aurion-core-schema-gate.yml', 'utf8');

function eventBlock(source) {
  const match = source.match(/^on:\n([\s\S]*?)^permissions:/m);
  assert.ok(match, 'workflow triggers and permissions must be explicit');
  return match[1];
}

test('full offline snapshot is exclusively a manual workflow, never a merge/PR job', () => {
  const events = eventBlock(offline);
  assert.match(events, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(events, /^  (push|pull_request|schedule):/m);
  assert.match(events, /default: godot-linux/);
  for (const mode of ['godot-linux', 'full']) assert.ok(events.includes(mode));
  assert.match(offline, /jobs:\n  exact-offline-pack:/);
  assert.match(offline, /inputs\.pack_type == 'full'/);
  assert.match(offline, /jobs:[\s\S]*?  godot-linux-project:/);
  assert.match(offline, /inputs\.pack_type == 'godot-linux'/);
  assert.match(offline, /inputs\.pack_type == 'full'/);
  assert.match(offline, /scripts\/godot\/build-offline-linux-pack\.sh/);
  assert.match(offline, /AURION_RELEASE_SHA:/);
  assert.match(offline, /actions\/upload-artifact@v4/);
});

test('PR/merge still execute a separate real MariaDB migration/native-auth gate', () => {
  const events = eventBlock(schema);
  assert.match(events, /^  pull_request:/m);
  assert.match(events, /^  push:/m);
  for (const p of ['server/**','shared/**','drizzle/**','scripts/**', 'pnpm-lock.yaml']) {
    assert.ok(events.includes(p), 'schema gate missing ' + p);
  }
  assert.match(schema, /mariadb:11\.4\.13/);
  assert.match(schema, /pnpm verify:migrations/);
  assert.match(schema, /drizzle-kit migrate/);
  assert.match(schema, /nativeAuthPersistenceMariaDb\.test\.ts/);
  assert.match(schema, /nativeAuthSchemaIsolation\.test\.ts/);
  assert.match(schema, /nativeAuthHttp\.test\.ts/);
  assert.match(schema, /\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
});
