/** A reviewed legacy release identity, never a dispatch-controlled allowlist. */
export const LEGACY_PROBE_BOOTSTRAP_REVISION = '9b84e8093f731d72a66f339461cdaed462bc4ace';

/** Bounded diagnostics only: never expose raw headers, bodies or redirect URLs. */
export function productionProbeHttpDiagnostic(status, headers) {
  let types = [];
  for (const line of String(headers).split(/\r?\n/)) {
    if (/^HTTP\//i.test(line)) types = [];
    const match = /^content-type:\s*([^;\r\n]*)(?:;.*)?$/i.exec(line);
    if (match) types.push(match[1].trim().toLowerCase());
  }
  const contentType = types.length === 0 ? 'missing'
    : types.length === 1 && ['application/json', 'text/html'].includes(types[0]) ? types[0] : 'other';
  return { recordType: 'aurion.production-probe-http-diagnostic',
    httpStatus: /^[1-5][0-9]{2}$/.test(String(status)) ? Number(status) : null, contentType };
}

/** Invalid upstream bodies must not be echoed into release logs. */
export function parseProductionProbeControlPlaneStatus(body) {
  let status;
  try { status = JSON.parse(body); }
  catch { throw new Error('PROBE_CONTROL_PLANE_STATUS_INVALID'); }
  if (!status || status.recordType !== 'aurion.production-probe-control-plane'
    || status.schemaVersion !== 1 || status.state !== 'ready' || status.mutationAuthority !== 'none') {
    throw new Error('PROBE_CONTROL_PLANE_STATUS_INVALID');
  }
  return status;
}

export function requireLegacyProbeBootstrap(health) {
  if (!health || health.service !== 'echoes-of-aurion' || health.status !== 'ok'
    || health.revision !== LEGACY_PROBE_BOOTSTRAP_REVISION
    || health.authority?.ruleset !== 'aurion-zone-v3' || health.authority?.tickHz !== 10
    || health.authority?.causalReceipts !== true) {
    throw new Error('PROBE_BOOTSTRAP_LEGACY_IDENTITY_REQUIRED');
  }
  return { revision: health.revision, mode: 'reviewed-legacy-probe-control-plane-bootstrap', credentialReturned: false };
}

export async function readLegacyProbeBootstrap() {
  const response = await fetch('https://arelogic.space/healthz', {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('PROBE_BOOTSTRAP_LEGACY_IDENTITY_UNAVAILABLE');
  }
  return requireLegacyProbeBootstrap(await response.json());
}
