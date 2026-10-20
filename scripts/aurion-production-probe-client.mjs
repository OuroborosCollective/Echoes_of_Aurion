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
  if (!response.ok) throw new Error('PROBE_AUTHORIZATION_DENIED');
  const body = await probeJson(response, executionSignal, 'PROBE_EXECUTION');
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || body.revision !== env.GITHUB_SHA || body.runId !== env.GITHUB_RUN_ID || body.runAttempt !== Number(env.GITHUB_RUN_ATTEMPT)
    || body.scope !== scope || body.mutationAuthority !== mutationAuthority || body.credentialReturned !== false) throw new Error('PROBE_RECEIPT_BINDING_MISMATCH');
  return body;
}
