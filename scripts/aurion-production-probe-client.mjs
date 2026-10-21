/** Fixed diagnostic codes only: fetch/JSON errors can contain private URLs or bodies. */
async function probeFetch(url, options, stage) {
  try { return await fetch(url, options); }
  catch (error) {
    const timeout = options.signal.aborted || error?.name === 'TimeoutError';
    throw new Error(`${stage}_${timeout ? 'TIMEOUT' : 'NETWORK_FAILED'}`);
  }
}

async function probeJson(response, signal, stage) {
  try { return await response.json(); }
  catch (error) {
    // The same deadline also covers a response whose headers arrived but body stalled.
    const requestStage = stage === 'PROBE_OIDC' ? 'PROBE_OIDC_REQUEST' : 'PROBE_EXECUTION';
    if (signal.aborted) throw new Error(`${requestStage}_TIMEOUT`);
    if (error instanceof SyntaxError) throw new Error(`${stage}_RESPONSE_INVALID`);
    throw new Error(`${requestStage}_NETWORK_FAILED`);
  }
}

/** Runner-side OIDC exchange. JWTs stay in memory and never enter artifacts. */
export async function executeProductionProbe(scope, env = process.env) {
  const mutationAuthority = scope === 'aurion.probe.gameplay-session-readback' ? 'ephemeral-probe-session' : 'none';
  if (!['aurion.probe.admin-readback', 'aurion.probe.gameplay-readback', 'aurion.probe.gameplay-session-readback'].includes(scope)) throw new Error('PROBE_SCOPE_INVALID');
  const rawUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!rawUrl || !requestToken) throw new Error('PROBE_OIDC_REQUEST_UNAVAILABLE');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com') || url.username || url.password) throw new Error('PROBE_OIDC_REQUEST_UNTRUSTED');
  url.searchParams.set('audience', 'aurion-production-probe');
  const oidcSignal = AbortSignal.timeout(10000);
  const oidc = await probeFetch(url, { headers: { authorization: `Bearer ${requestToken}` }, redirect: 'error', signal: oidcSignal }, 'PROBE_OIDC_REQUEST');
  if (!oidc.ok) throw new Error('PROBE_OIDC_REQUEST_FAILED');
  const tokenBody = await probeJson(oidc, oidcSignal, 'PROBE_OIDC');
  if (!tokenBody || typeof tokenBody !== 'object' || Array.isArray(tokenBody)) throw new Error('PROBE_OIDC_RESPONSE_INVALID');
  const { value } = tokenBody;
  if (typeof value !== 'string' || value.length < 100 || value.length > 16384) throw new Error('PROBE_OIDC_REQUEST_FAILED');
  const executionSignal = AbortSignal.timeout(scope === 'aurion.probe.gameplay-session-readback' ? 120000 : 15000);
  const response = await probeFetch('https://arelogic.space/api/production-probe/execute', { method: 'POST',
    headers: { authorization: `Bearer ${value}`, 'content-type': 'application/json' }, body: JSON.stringify({ scope }),
    redirect: 'error', signal: executionSignal }, 'PROBE_EXECUTION');
  if (!response.ok) {
    const error = new Error('PROBE_AUTHORIZATION_DENIED');
    error.httpStatus = response.status;
    throw error;
  }
  const body = await probeJson(response, executionSignal, 'PROBE_EXECUTION');
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || body.revision !== env.GITHUB_SHA || body.runId !== env.GITHUB_RUN_ID || body.runAttempt !== Number(env.GITHUB_RUN_ATTEMPT)
    || body.scope !== scope || body.mutationAuthority !== mutationAuthority || body.credentialReturned !== false) throw new Error('PROBE_RECEIPT_BINDING_MISMATCH');
  return body;
}

/**
 * A separate, non-consuming OIDC readiness exchange. Never call the effectful
 * execute endpoint to poll: one ambiguous response may have spent the approval.
 */
export async function readProductionGameplayApprovalReadiness(env = process.env) {
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) throw new Error('PROBE_RUN_IDENTITY_INVALID');
  const rawUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!rawUrl || !requestToken) throw new Error('PROBE_OIDC_REQUEST_UNAVAILABLE');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com') || url.username || url.password)
    throw new Error('PROBE_OIDC_REQUEST_UNTRUSTED');
  url.searchParams.set('audience', 'aurion-production-probe');
  const oidcSignal = AbortSignal.timeout(10000);
  const oidc = await probeFetch(url, { headers: { authorization: `Bearer ${requestToken}` },
    redirect: 'error', signal: oidcSignal }, 'PROBE_OIDC_REQUEST');
  if (!oidc.ok) throw new Error('PROBE_OIDC_REQUEST_FAILED');
  const tokenBody = await probeJson(oidc, oidcSignal, 'PROBE_OIDC');
  if (!tokenBody || typeof tokenBody !== 'object' || Array.isArray(tokenBody)
    || typeof tokenBody.value !== 'string' || tokenBody.value.length < 100 || tokenBody.value.length > 16384)
    throw new Error('PROBE_OIDC_RESPONSE_INVALID');
  const scope = 'aurion.probe.gameplay-session-readback';
  const signal = AbortSignal.timeout(15000);
  const response = await probeFetch('https://arelogic.space/api/production-probe/readiness', {
    method: 'POST', headers: { authorization: `Bearer ${tokenBody.value}`, 'content-type': 'application/json' },
    body: JSON.stringify({ scope }), redirect: 'error', signal,
  }, 'PROBE_READINESS_REQUEST');
  if (!response.ok) throw new Error('PROBE_READINESS_REQUEST_FAILED');
  const result = await probeJson(response, signal, 'PROBE_READINESS');
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || result.recordType !== 'aurion.production-probe-readiness' || result.schemaVersion !== 1
    || result.revision !== env.GITHUB_SHA || result.runId !== env.GITHUB_RUN_ID
    || result.runAttempt !== Number(env.GITHUB_RUN_ATTEMPT) || result.scope !== scope
    || result.credentialReturned !== false || !['READY','WAITING'].includes(result.state))
    throw new Error('PROBE_READINESS_BINDING_MISMATCH');
  return result.state;
}

/** Copy-friendly link; parameters are inert until explicit owner reauthentication. */
function approvalPrefillUrl(identity, scope) {
  const link = new URL('https://arelogic.space/ops');
  link.searchParams.set('aurion_revision', identity.GITHUB_SHA);
  link.searchParams.set('aurion_run_id', identity.GITHUB_RUN_ID);
  link.searchParams.set('aurion_attempt', identity.GITHUB_RUN_ATTEMPT);
  link.searchParams.set('aurion_scope', scope);
  return link.toString();
}

/** Bounded wait for a separate owner action; only the final effectful POST runs once. */
export async function waitForProductionGameplayApproval(env = process.env, {
  now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  report = value => console.log(JSON.stringify(value)),
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ''))
    throw new Error('PROBE_RUN_IDENTITY_INVALID');
  const identity = { ...env };
  const scope = 'aurion.probe.gameplay-session-readback';
  const deadline = now() + 15 * 60 * 1000;
  report({ recordType:'aurion.production-gameplay-approval-wait',
    approvalUrl:'https://arelogic.space/ops', prefilledApprovalUrl:approvalPrefillUrl(identity,scope), revision:identity.GITHUB_SHA,
    runId:identity.GITHUB_RUN_ID, runAttempt:Number(identity.GITHUB_RUN_ATTEMPT),
    scope, purpose:'Produktionsrelease Gameplay-Join/Readback',
    maxWaitSeconds:900 });
  for (let attempt=0; attempt<90 && now()<deadline; attempt++) {
    const state = await readProductionGameplayApprovalReadiness(identity);
    if (state === 'READY') return executeProductionProbe(scope, identity);
    if (attempt===0 || attempt%6===0)
      report({ recordType:'aurion.production-gameplay-approval-wait', status:'NOT_AUTHORIZED_YET' });
    const remaining=deadline-now();
    if (remaining<=0) break;
    await sleep(Math.min(10000,remaining));
  }
  throw new Error('PROBE_GAMEPLAY_APPROVAL_WAIT_EXPIRED');
}

/** Only the read-only admin exchange may be repeated. A 403 is deliberately
 * ambiguous on the deployed server; never claim it proves a missing approval.
 * Every attempt obtains fresh OIDC and still requires the exact bound receipt.
 * Network/body failures are NOT retried: the approval may already be consumed.
 */
export async function waitForProductionAdminApproval(env = process.env, {
  now = () => performance.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  report = value => console.log(JSON.stringify(value)),
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '')
    || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) throw new Error('PROBE_RUN_IDENTITY_INVALID');
  // Snapshot identity; a pending wait must not silently follow another run.
  const identity = { ...env };
  const scope = 'aurion.probe.admin-readback';
  const deadline = now() + 15 * 60 * 1000;
  report({ recordType: 'aurion.production-probe-approval-wait',
    approvalUrl: 'https://arelogic.space/ops', prefilledApprovalUrl:approvalPrefillUrl(identity,scope), revision: identity.GITHUB_SHA,
    runId: identity.GITHUB_RUN_ID, runAttempt: Number(identity.GITHUB_RUN_ATTEMPT),
    scope, purpose: 'Produktionsrelease Schema-Preflight', maxWaitSeconds: 900 });
  for (let attempt = 0; attempt < 90 && now() < deadline; attempt++) {
    try {
      const receipt = await executeProductionProbe(scope, identity);
      if (receipt.status !== 'AUTHORIZED') throw new Error('PROBE_PREFLIGHT_NOT_AUTHORIZED');
      return receipt;
    } catch (error) {
      if (error?.message !== 'PROBE_AUTHORIZATION_DENIED' || error.httpStatus !== 403) throw error;
    }
    if (attempt === 0 || attempt % 6 === 0) report({
      recordType: 'aurion.production-probe-approval-wait', status: 'NOT_AUTHORIZED_YET',
    });
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(10000, remaining));
  }
  throw new Error('PROBE_ADMIN_APPROVAL_WAIT_EXPIRED');
}
