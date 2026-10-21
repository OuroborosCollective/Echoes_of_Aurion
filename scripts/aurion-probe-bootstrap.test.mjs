import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LEGACY_PROBE_BOOTSTRAP_REVISION, requireLegacyProbeBootstrap, parseProductionProbeControlPlaneStatus, productionProbeHttpDiagnostic } from './aurion-probe-bootstrap.mjs';

test('HTTP diagnostics redact untrusted values and use the final response header block', () => {
  for (const [status, headers, code, type] of [
    ['403', 'HTTP/2 403\r\nContent-Type: text/html; token=private-secret\r\nLocation: https://example.invalid/?token=private-secret\r\n', 403, 'text/html'],
    ['502', 'Content-Type: application/json; charset=utf-8\r\n', 502, 'application/json'],
    ['301', 'Location: https://example.invalid/?token=private-secret\r\n', 301, 'missing'],
    ['200', 'Content-Type: application/private-secret\r\n', 200, 'other'],
    ['200', 'Content-Type: application/json\r\nContent-Type: text/html\r\n', 200, 'other'],
    ['200', 'HTTP/1.1 200 Connection established\r\nContent-Type: text/html\r\n\r\nHTTP/2 200\r\nContent-Type: Application/JSON\r\n', 200, 'application/json'],
    ['503', 'HTTP/1.1 200\r\nContent-Type: text/html\r\n\r\nHTTP/2 503\r\n', 503, 'missing'],
    ['private-secret', 'Content-Type: private-secret\n', null, 'other'],
  ]) {
    const diagnostic = productionProbeHttpDiagnostic(status, headers);
    assert.deepEqual(diagnostic, { recordType: 'aurion.production-probe-http-diagnostic', httpStatus: code, contentType: type });
    assert.ok(!JSON.stringify(diagnostic).includes('private-secret'));
  }
});

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
      GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
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
      const records = result.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.equal(records[0].httpStatus, Number(status));
      if (expected === 'PROBE_OIDC_REQUEST_UNAVAILABLE') {
        assert.equal(records[1].recordType, 'aurion.production-probe-approval-wait');
        assert.equal(records[1].revision, env.GITHUB_SHA);
      } else assert.equal(records.length, 1);
      if (expected !== 'PROBE_OIDC_REQUEST_UNAVAILABLE') assert.ok(!result.stderr.includes('PROBE_OIDC_'));
    }
    for (const [status, type] of [['301', 'text/html'], ['403', 'text/html'], ['502', 'text/html'],
      ['503', 'application/json'], ['200', 'application/json'], ['200', 'application/private-secret']]) {
      fs.writeFileSync(env.FIXTURE_HEADERS, `HTTP/2 ${status}\r\ncontent-type: ${type}; token=private-secret\r\nlocation: https://example.invalid/?token=private-secret\r\n\r\n`);
      fs.writeFileSync(env.FIXTURE_BODY, 'private-secret');
      const result = spawnSync('bash', ['-c', step], { cwd: root,
        env: { ...env, BOOTSTRAP_PROBE_CONTROL_PLANE: 'true', FIXTURE_STATUS: status }, encoding: 'utf8' });
      assert.equal(result.status, 70);
      assert.match(result.stderr, /PROBE_BOOTSTRAP_RESPONSE_NOT_ELIGIBLE/);
      assert.equal(JSON.parse(result.stdout.trim()).httpStatus, Number(status));
      assert.ok(!(result.stdout + result.stderr).includes('private-secret'));
      assert.ok(!(result.stdout + result.stderr).includes('https://'));
    }
    // Stub only the external legacy read: eligible absence must still reach
    // that identity check, never return success merely because a route is absent.
    fs.writeFileSync(path.join(temp, 'node'), `#!/bin/bash
source_text=$(cat)
if [[ "$source_text" == *'await readLegacyProbeBootstrap()'* ]]; then
  echo PROBE_BOOTSTRAP_LEGACY_IDENTITY_REQUIRED >&2
  exit 77
fi
printf '%s' "$source_text" | "$REAL_NODE" "$@"
`, { mode: 0o700 });
    for (const [status, type] of [['404', 'application/json'], ['200', 'text/html; charset=utf-8']]) {
      fs.writeFileSync(env.FIXTURE_HEADERS, `HTTP/2 ${status}\r\ncontent-type: ${type}\r\n\r\n`);
      fs.writeFileSync(env.FIXTURE_BODY, 'private-secret');
      const result = spawnSync('bash', ['-c', step], { cwd: root,
        env: { ...env, REAL_NODE: process.execPath, BOOTSTRAP_PROBE_CONTROL_PLANE: 'true', FIXTURE_STATUS: status }, encoding: 'utf8' });
      assert.equal(result.status, 77, result.stderr);
      assert.match(result.stderr, /PROBE_BOOTSTRAP_LEGACY_IDENTITY_REQUIRED/);
      assert.equal(JSON.parse(result.stdout.trim()).httpStatus, Number(status));
      assert.ok(!(result.stdout + result.stderr).includes('private-secret'));
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
