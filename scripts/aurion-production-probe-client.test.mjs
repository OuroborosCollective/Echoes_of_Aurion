import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { executeProductionProbe, waitForProductionAdminApproval, waitForProductionGameplayApproval, approvalWaitSeconds, notifyApprovalWait } from './aurion-production-probe-client.mjs';

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
  let interruptedResponse;
  const calls = [];
  const server = createServer((req, res) => {
    const stage = req.url === '/token' ? 'oidc' : 'execute';
    calls.push(stage);
    if (mode === `${stage}-timeout`) return;
    if (mode === `${stage}-body-timeout`) { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); return; }
    if (mode === `${stage}-body-disconnect`) {
      interruptedResponse = res;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{');
      return;
    }
    if (mode === `${stage}-disconnect`) { req.socket.destroy(); return; }
    res.setHeader('content-type', 'application/json');
    if (mode === `${stage}-denied`) { res.writeHead(403); res.end('private-test-server-body'); return; }
    if (mode === `${stage}-invalid`) { res.end('{private-test-server-body'); return; }
    if (mode === `${stage}-null`) { res.end('null'); return; }
    const body = JSON.stringify(stage === 'oidc' ? { value: 'disposable-test-jwt'.repeat(10) }
      : mode === 'binding-mismatch' ? { ...receipt, runAttempt: 2 } : receipt);
    // Prove that a slower OIDC setup cannot consume the execution-only deadline.
    if (stage === 'oidc' && mode.startsWith('execute-') && mode.endsWith('-timeout')) {
      setTimeout(() => res.end(body), 160);
    } else res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.mock.method(AbortSignal, 'timeout', ms => {
    const stage = ms === 10000 ? 'oidc' : 'execute';
    return nativeTimeout(mode.startsWith(`${stage}-`) && mode.endsWith('-timeout') ? 80 : ms);
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const oidc = new URL(url).hostname === 'test.actions.githubusercontent.com';
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (oidc) assert.equal(new URL(url).searchParams.get('audience'), 'aurion-production-probe');
    else {
      assert.equal(String(url), 'https://arelogic.space/api/production-probe/execute');
      assert.deepEqual(JSON.parse(options.body), { scope });
    }
    const response = await nativeFetch(`${origin}/${oidc ? 'token' : 'execute'}`, options);
    if (mode === `${oidc ? 'oidc' : 'execute'}-body-disconnect`) {
      // Headers have actually reached fetch; break only the remaining body stream.
      assert.equal(response.status, 200);
      interruptedResponse.destroy();
    }
    return response;
  });
  try {
    for (const [scenario, expected] of [
      ['oidc-timeout', 'PROBE_OIDC_REQUEST_TIMEOUT'],
      ['execute-timeout', 'PROBE_EXECUTION_TIMEOUT'],
      ['oidc-body-timeout', 'PROBE_OIDC_REQUEST_TIMEOUT'],
      ['execute-body-timeout', 'PROBE_EXECUTION_TIMEOUT'],
      ['oidc-disconnect', 'PROBE_OIDC_REQUEST_NETWORK_FAILED'],
      ['execute-disconnect', 'PROBE_EXECUTION_NETWORK_FAILED'],
      ['oidc-body-disconnect', 'PROBE_OIDC_REQUEST_NETWORK_FAILED'],
      ['execute-body-disconnect', 'PROBE_EXECUTION_NETWORK_FAILED'],
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

test('admin preflight waits for late approval without relaxing OIDC or receipt binding', async t => {
  const nativeFetch = globalThis.fetch;
  let mode = 'late', executions = 0, tokens = 0, clock = 0;
  const reports = [];
  const adminReceipt = { ...receipt, scope: 'aurion.probe.admin-readback', mutationAuthority: 'none', status: 'AUTHORIZED' };
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/token') {
      tokens++;
      if (mode === 'oidc-denied') { res.writeHead(403); res.end('{}'); return; }
      res.end(JSON.stringify({ value: (`test-token-${tokens}-`).repeat(20) })); return;
    }
    executions++;
    if (mode === 'network') { req.socket.destroy(); return; }
    if (mode === 'denied' || (mode === 'late' && executions < 3) || mode === 'server-error') {
      res.writeHead(mode === 'server-error' ? 503 : 403); res.end('{}'); return;
    }
    res.end(JSON.stringify(mode === 'mismatch' ? { ...adminReceipt, runAttempt: 2 }
      : mode === 'wrong-status' ? { ...adminReceipt, status: 'OBSERVED' } : adminReceipt));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const oidc = new URL(url).hostname === 'test.actions.githubusercontent.com';
    if (!oidc) {
      assert.deepEqual(JSON.parse(options.body), { scope: 'aurion.probe.admin-readback' });
      assert.equal(options.headers.authorization, `Bearer ${(`test-token-${tokens}-`).repeat(20)}`);
    }
    return nativeFetch(`http://127.0.0.1:${server.address().port}/${oidc ? 'token' : 'execute'}`, options);
  });
  const options = { now: () => clock, sleep: async ms => { clock += ms; }, report: value => reports.push(value) };
  try {
    assert.deepEqual(await waitForProductionAdminApproval(env, options), adminReceipt);
    assert.equal(executions, 3); assert.equal(tokens, 3); assert.equal(clock, 20000);
    assert.equal(reports[0].approvalUrl, 'https://arelogic.space/ops');
    assert.equal(reports[0].revision, env.GITHUB_SHA);
    assert.ok(!JSON.stringify(reports).includes('test-token'));
    for (const [scenario, code] of [
      ['denied', 'PROBE_ADMIN_APPROVAL_WAIT_EXPIRED'], ['server-error', 'PROBE_AUTHORIZATION_DENIED'],
      ['network', 'PROBE_EXECUTION_NETWORK_FAILED'], ['oidc-denied', 'PROBE_OIDC_REQUEST_FAILED'],
      ['mismatch', 'PROBE_RECEIPT_BINDING_MISMATCH'], ['wrong-status', 'PROBE_PREFLIGHT_NOT_AUTHORIZED'],
    ]) {
      mode = scenario; executions = 0; tokens = 0; clock = 0;
      await assert.rejects(waitForProductionAdminApproval(env, options), { message: code });
      assert.equal(executions, scenario === 'denied' ? 90 : scenario === 'oidc-denied' ? 0 : 1);
      if (scenario === 'denied') assert.equal(clock, 900000);
    }
    executions = 0;
    await assert.rejects(waitForProductionAdminApproval({ ...env, GITHUB_RUN_ATTEMPT: 'invalid' }, options), { message: 'PROBE_RUN_IDENTITY_INVALID' });
    assert.equal(executions, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('gameplay readiness polls read-only, then runs exactly one effectful execution', async t => {
  const nativeFetch = globalThis.fetch;
  let readyChecks=0, executions=0, tokens=0, clock=0;
  const reports=[];
  const server=createServer((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/token') {
      tokens++;
      res.end(JSON.stringify({value:'local-test-token-'.repeat(10)}));return;
    }
    if(req.url==='/readiness'){
      readyChecks++;
      res.end(JSON.stringify({recordType:'aurion.production-probe-readiness',schemaVersion:1,
        revision:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:1,scope,
        state:readyChecks<3?'WAITING':'READY',credentialReturned:false}));return;
    }
    if(req.url==='/execute'){
      executions++;
      res.end(JSON.stringify(receipt));return;
    }
    res.statusCode=404;res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const parsed=new URL(url),oidc=parsed.hostname.endsWith('.actions.githubusercontent.com');
    assert.equal(options.redirect,'error');
    if(!oidc) {
      assert.equal(options.method,'POST');
      assert.deepEqual(JSON.parse(options.body),{scope});
    }
    const stage=oidc?'token':parsed.pathname.endsWith('/readiness')?'readiness':'execute';
    return nativeFetch('http://127.0.0.1:'+server.address().port+'/'+stage,options);
  });
  try{
    const output=await waitForProductionGameplayApproval(env,{
      now:()=>clock,sleep:async ms=>{clock+=ms;},report:v=>reports.push(v),
    });
    assert.deepEqual(output,receipt);
    assert.equal(readyChecks,3);
    assert.equal(executions,1);
    assert.equal(clock,20000);
    assert.equal(reports[0].scope,scope);
    assert.equal(reports[0].runId,env.GITHUB_RUN_ID);
    assert.ok(!JSON.stringify(reports).includes('local-test-token'));
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});

test('configurable admin window remains bounded and defaults safely', () => {
  assert.equal(approvalWaitSeconds({}), 900);
  assert.equal(approvalWaitSeconds({ AURION_PROBE_APPROVAL_WAIT_SECONDS: '2400' }), 2400);
  for (const bad of ['', '59', '3601', 'abc', '-900', '1e3', '99999', ' 900'])
    assert.equal(approvalWaitSeconds({ AURION_PROBE_APPROVAL_WAIT_SECONDS: bad }), 900);
});

test('best-effort notification contains exact revision and run but no credentials', async () => {
  const local = { ...env, GITHUB_REPOSITORY: 'OuroborosCollective/Echoes_of_Aurion',
    AURION_APPROVAL_NOTIFY_URL: 'https://ntfy.example/private-topic' };
  const calls = [];
  const result = await notifyApprovalWait(local,
    { revision:env.GITHUB_SHA, runId:'123', runAttempt:1, waitSeconds:2400 },
    async (url, options) => { calls.push({ url, options }); return { ok:true }; });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, local.AURION_APPROVAL_NOTIFY_URL);
  assert.ok(calls[0].options.body.includes('SHA: '+env.GITHUB_SHA));
  assert.ok(calls[0].options.body.includes('Run-ID: 123'));
  assert.match(calls[0].options.body, /aurion_revision=/);
  assert.match(calls[0].options.body, /actions\\/runs\\/123/);
  assert.ok(!calls[0].options.body.includes(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN));
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(await notifyApprovalWait({...local,AURION_APPROVAL_NOTIFY_URL:'http://insecure.example/'},
    {revision:env.GITHUB_SHA,runId:'123',runAttempt:1,waitSeconds:2400},
    async () => { throw new Error('insecure attempt'); }), false);
  assert.equal(await notifyApprovalWait(local,
    {revision:env.GITHUB_SHA,runId:'123',runAttempt:1,waitSeconds:2400},
    async () => { throw new Error('network offline'); }), false);
});

test('extended admin wait sends one notification without affecting gameplay gate', async t => {
  let clock=0, attempts=0, notices=0;
  t.mock.method(globalThis,'fetch',async url => {
    if (new URL(url).hostname.endsWith('.actions.githubusercontent.com'))
      return new Response(JSON.stringify({value:'local-test-token-'.repeat(10)}), {status:200});
    attempts++;
    return new Response('{}',{status:403});
  });
  await assert.rejects(waitForProductionAdminApproval(
    {...env, AURION_PROBE_APPROVAL_WAIT_SECONDS:'2400'},
    {now:()=>clock,sleep:async ms=>{clock+=ms;},report:()=>{},
      notify:async()=>{notices++;return true;}}), {message:'PROBE_ADMIN_APPROVAL_WAIT_EXPIRED'});
  assert.equal(attempts,240);
  assert.equal(clock,2400000);
  assert.equal(notices,1);
});
