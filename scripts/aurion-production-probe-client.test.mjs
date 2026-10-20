import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { executeProductionProbe } from './aurion-production-probe-client.mjs';

// Disposable loopback responses prove runner diagnostics, never production OIDC,
// scope approval, gameplay or persistence. All credentials below are test-only.
const scope = 'aurion.probe.gameplay-session-readback';
const env = {
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://test.actions.githubusercontent.com/token',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'private-test-request-token',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
};
const receipt = { revision: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, runAttempt: 1,
  scope, mutationAuthority: 'ephemeral-probe-session', credentialReturned: false };

test('classifies transport and JSON failures at the actual runner exchange boundary', async t => {
  const nativeFetch = globalThis.fetch;
  const nativeTimeout = AbortSignal.timeout;
  let mode = 'success';
  const calls = [];
  const server = createServer((req, res) => {
    const stage = req.url === '/token' ? 'oidc' : 'execute';
    calls.push(stage);
    if (mode === `${stage}-timeout`) return;
    if (mode === `${stage}-body-timeout`) { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); return; }
    if (mode === `${stage}-disconnect`) { req.socket.destroy(); return; }
    res.setHeader('content-type', 'application/json');
    if (mode === `${stage}-denied`) { res.writeHead(403); res.end('private-test-server-body'); return; }
    if (mode === `${stage}-invalid`) { res.end('{private-test-server-body'); return; }
    if (mode === `${stage}-null`) { res.end('null'); return; }
    res.end(JSON.stringify(stage === 'oidc' ? { value: 'disposable-test-jwt'.repeat(10) }
      : mode === 'binding-mismatch' ? { ...receipt, runAttempt: 2 } : receipt));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.mock.method(AbortSignal, 'timeout', ms => nativeTimeout(mode.endsWith('-timeout') ? 80 : ms));
  t.mock.method(globalThis, 'fetch', (url, options) => {
    const oidc = new URL(url).hostname === 'test.actions.githubusercontent.com';
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (oidc) assert.equal(new URL(url).searchParams.get('audience'), 'aurion-production-probe');
    else {
      assert.equal(String(url), 'https://arelogic.space/api/production-probe/execute');
      assert.deepEqual(JSON.parse(options.body), { scope });
    }
    return nativeFetch(`${origin}/${oidc ? 'token' : 'execute'}`, options);
  });
  try {
    for (const [scenario, expected] of [
      ['oidc-timeout', 'PROBE_OIDC_REQUEST_TIMEOUT'],
      ['execute-timeout', 'PROBE_EXECUTION_TIMEOUT'],
      ['oidc-body-timeout', 'PROBE_OIDC_REQUEST_TIMEOUT'],
      ['execute-body-timeout', 'PROBE_EXECUTION_TIMEOUT'],
      ['oidc-disconnect', 'PROBE_OIDC_REQUEST_NETWORK_FAILED'],
      ['execute-disconnect', 'PROBE_EXECUTION_NETWORK_FAILED'],
      ['oidc-invalid', 'PROBE_OIDC_RESPONSE_INVALID'],
      ['execute-invalid', 'PROBE_EXECUTION_RESPONSE_INVALID'],
      ['oidc-null', 'PROBE_OIDC_RESPONSE_INVALID'],
      ['execute-null', 'PROBE_RECEIPT_BINDING_MISMATCH'],
      ['oidc-denied', 'PROBE_OIDC_REQUEST_FAILED'],
      ['execute-denied', 'PROBE_AUTHORIZATION_DENIED'],
      ['binding-mismatch', 'PROBE_RECEIPT_BINDING_MISMATCH'],
    ]) await t.test(scenario, async () => {
      mode = scenario; calls.length = 0;
      await assert.rejects(executeProductionProbe(scope, env), error => {
        assert.equal(error.message, expected);
        assert.match(error.message, /^[A-Z_]{5,80}$/); // Accepted by the real CLI artifact sanitizer.
        assert.equal(error.cause, undefined);
        assert.ok(!String(error.stack).includes('private-test'));
        return true;
      });
      assert.deepEqual(calls, scenario.startsWith('oidc-') ? ['oidc'] : ['oidc', 'execute']);
    });
    await t.test('successful exact receipt remains unchanged', async () => {
      mode = 'success';
      assert.deepEqual(await executeProductionProbe(scope, env), receipt);
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
