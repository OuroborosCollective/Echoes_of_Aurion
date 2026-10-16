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
  const oidc = await fetch(url, { headers: { authorization: `Bearer ${requestToken}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!oidc.ok) throw new Error('PROBE_OIDC_REQUEST_FAILED');
  const { value } = await oidc.json();
  if (typeof value !== 'string' || value.length < 100 || value.length > 16384) throw new Error('PROBE_OIDC_REQUEST_FAILED');
  const response = await fetch('https://arelogic.space/api/production-probe/execute', { method: 'POST',
    headers: { authorization: `Bearer ${value}`, 'content-type': 'application/json' }, body: JSON.stringify({ scope }),
    redirect: 'error', signal: AbortSignal.timeout(scope === 'aurion.probe.gameplay-session-readback' ? 120000 : 15000) });
  if (!response.ok) throw new Error('PROBE_AUTHORIZATION_DENIED');
  const body = await response.json();
  if (body.revision !== env.GITHUB_SHA || body.runId !== env.GITHUB_RUN_ID || body.runAttempt !== Number(env.GITHUB_RUN_ATTEMPT)
    || body.scope !== scope || body.mutationAuthority !== mutationAuthority || body.credentialReturned !== false) throw new Error('PROBE_RECEIPT_BINDING_MISMATCH');
  return body;
}
