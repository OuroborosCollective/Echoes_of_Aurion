/** A reviewed legacy release identity, never a dispatch-controlled allowlist. */
export const LEGACY_PROBE_BOOTSTRAP_REVISION = '9b84e8093f731d72a66f339461cdaed462bc4ace';

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
