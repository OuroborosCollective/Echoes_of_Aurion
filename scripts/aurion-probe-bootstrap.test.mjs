import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_PROBE_BOOTSTRAP_REVISION, requireLegacyProbeBootstrap } from './aurion-probe-bootstrap.mjs';

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
