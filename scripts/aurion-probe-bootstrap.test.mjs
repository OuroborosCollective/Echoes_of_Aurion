import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LEGACY_PROBE_BOOTSTRAP_REVISION, requireLegacyProbeBootstrap, parseProductionProbeControlPlaneStatus } from './aurion-probe-bootstrap.mjs';

const legacy = { service: 'echoes-of-aurion', status: 'ok', revision: LEGACY_PROBE_BOOTSTRAP_REVISION,
  authority: { ruleset: 'aurion-zone-v3', tickHz: 10, causalReceipts: true } };
test('requires positively identified reviewed legacy deployment, not endpoint absence', () => {
  assert.equal(requireLegacyProbeBootstrap(legacy).revision, LEGACY_PROBE_BOOTSTRAP_REVISION);
  for (const invalid of [null, '<html>fallback</html>', {}, { status: 404 },
    { ...legacy, revision: 'a'.repeat(40) }, { ...legacy, revision: undefined },
    { ...legacy, service: 'proxy' }, { ...legacy, status: 'degraded' },
    { ...legacy, authority: { ...legacy.authority, causalReceipts: false } }]) {
    assert.throws(() => requireLegacyProbeBootstrap(invalid), /PROBE_BOOTSTRAP_LEGACY_IDENTITY_REQUIRED/);
  }
});

const ready = { recordType: 'aurion.production-probe-control-plane', schemaVersion: 1,
  state: 'ready', mutationAuthority: 'none' };
test('validates control-plane JSON without disclosing malformed response content', () => {
  assert.deepEqual(parseProductionProbeControlPlaneStatus(JSON.stringify(ready)), ready);
  for (const body of ['<!doctype html>private upstream body', '{private upstream body', '', 'null', '[]', '{}',
    JSON.stringify({ ...ready, state: 'unavailable' }), JSON.stringify({ ...ready, mutationAuthority: 'write' }),
    JSON.stringify({ ...ready, schemaVersion: 2 }), JSON.stringify({ ...ready, recordType: 'proxy' })]) {
    assert.throws(() => parseProductionProbeControlPlaneStatus(body),
      { message: 'PROBE_CONTROL_PLANE_STATUS_INVALID' });
  }
});

// Execute the actual workflow shell with local HTTP response fixtures. This is
// gate regression evidence only, never a production response or OIDC receipt.
test('normal release preflight rejects HTML before OIDC and still requires approval for ready JSON', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-aurion-zone-runtime.yml'), 'utf8');
  const step = workflow.split('      - name: Require owner-approved OIDC preflight or reviewed legacy bootstrap\n')[1]
    .split('\n  prepare-schema-tools:')[0].split('        run: |\n')[1]
    .split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurion-preflight-'));
  try {
    fs.writeFileSync(path.join(temp, 'curl'), `#!/bin/bash
while (($#)); do
  case "$1" in
    --dump-header) cp "$FIXTURE_HEADERS" "$2"; shift 2 ;;
    --output) cp "$FIXTURE_BODY" "$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s' "$FIXTURE_STATUS"
`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${temp}:${process.env.PATH}`, BOOTSTRAP_PROBE_CONTROL_PLANE: 'false',
      FIXTURE_HEADERS: path.join(temp, 'headers'), FIXTURE_BODY: path.join(temp, 'body') };
    delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
    delete env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    for (const [status, type, body, expected] of [
      ['200', 'text/html; charset=utf-8', '<!doctype html>private upstream body', 'PROBE_CONTROL_PLANE_REQUIRED'],
      ['200', '', JSON.stringify(ready), 'PROBE_CONTROL_PLANE_REQUIRED'],
      ['200', 'application/jsonp', JSON.stringify(ready), 'PROBE_CONTROL_PLANE_REQUIRED'],
      ['404', 'application/json', JSON.stringify(ready), 'PROBE_CONTROL_PLANE_REQUIRED'],
      ['503', 'application/json', JSON.stringify(ready), 'PROBE_CONTROL_PLANE_REQUIRED'],
      ['200', 'application/json', '<html>private upstream body', 'PROBE_CONTROL_PLANE_STATUS_INVALID'],
      ['200', 'application/json', 'null', 'PROBE_CONTROL_PLANE_STATUS_INVALID'],
      ['200', 'application/json', JSON.stringify({ ...ready, state: 'unavailable' }), 'PROBE_CONTROL_PLANE_STATUS_INVALID'],
      ['200', 'Application/JSON; charset=utf-8', JSON.stringify(ready), 'PROBE_OIDC_REQUEST_UNAVAILABLE'],
    ]) {
      fs.writeFileSync(env.FIXTURE_HEADERS, `HTTP/2 ${status}\r\ncontent-type: ${type}\r\n\r\n`);
      fs.writeFileSync(env.FIXTURE_BODY, body);
      const result = spawnSync('bash', ['-c', step], { cwd: root, env: { ...env, FIXTURE_STATUS: status }, encoding: 'utf8' });
      assert.notEqual(result.status, 0, `${status} ${type} must not authorize production`);
      assert.ok(result.stderr.includes(expected), result.stderr);
      assert.ok(!result.stderr.includes('private upstream body'), 'upstream content must remain private');
      assert.ok(!result.stderr.includes('SyntaxError'), 'failure must be classified');
      if (expected !== 'PROBE_OIDC_REQUEST_UNAVAILABLE') assert.ok(!result.stderr.includes('PROBE_OIDC_'));
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
