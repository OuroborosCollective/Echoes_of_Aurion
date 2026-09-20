import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { FAULT_BOUNDARIES, runFault, assertTestIsolation, type Fault } from '../../scripts/causal-chaos/harness';

beforeEach(() => { vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('AURION_SCHEMA_DATABASE_URL', ''); vi.stubEnv('NODE_ENV', 'test'); });
afterEach(() => vi.unstubAllEnvs());

describe('CI-only causal chaos FIRST_DIVERGENCE', () => {
  for (const fault of Object.keys(FAULT_BOUNDARIES).filter(f => f !== 'ATTESTATION_TAMPER') as Fault[]) {
    it(`localizes ${fault} without mutating evidence`, async () => {
      const result = await runFault(fault);
      expect(result.detected).toBe(true);
      expect(result.observed.boundary).toBe(FAULT_BOUNDARIES[fault]);
      expect(result.observed.status).not.toBe('VERIFIED');
      expect(result.fixtureUnchanged).toBe(true);
      if (fault === 'MOB_COMBAT_DIVERGENCE') expect(result.verifiedStages).toEqual([
        'PRE_STATE', 'INPUT_ORDER', 'AUTHORITY:MEMBERSHIP_REVIVAL', 'AUTHORITY:MOVEMENT',
        'AUTHORITY:PLAYER_ACTION', 'AUTHORITY:RESOURCE', 'AUTHORITY:MOB_FSM',
      ]);
      if (fault === 'SOURCE_REVISION_MISMATCH') expect(result.verifiedStages).toEqual(['TICK:1']);
    });
  }
  it('never substitutes a fixture boolean for missing cryptographic attestation evidence', async () => {
    expect(await runFault('ATTESTATION_TAMPER')).toMatchObject({ detected: false, observed: { status: 'UNPROVABLE', reason: 'ATTESTATION_EVIDENCE_REQUIRED' } });
  });
  it('reproduces the same semantic receipt and report despite fresh transport identities', async () => {
    expect(await runFault('MOB_COMBAT_DIVERGENCE')).toEqual(await runFault('MOB_COMBAT_DIVERGENCE'));
  });
  it('refuses production mode and any configured database before fixture access', () => {
    vi.stubEnv('NODE_ENV', 'production'); expect(assertTestIsolation).toThrow('OFFLINE_TEST_ENVIRONMENT');
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DATABASE_URL', 'mysql://invalid'); expect(assertTestIsolation).toThrow('OFFLINE_TEST_ENVIRONMENT');
  });
  it('returns machine-readable CLI evidence and distinct exit codes', () => {
    const cli = (args: string[], env = process.env) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-aurion-causal-chaos.mjs', ...args], { encoding: 'utf8', env, timeout: 30000 });
    const result = cli(['--fault', 'MOB_COMBAT_DIVERGENCE']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).results[0]).toMatchObject({ detected: true, observed: { boundary: 'MOB_COMBAT' } });
    expect(cli(['--fault', 'ATTESTATION_TAMPER'], { ...process.env, AURION_CHAOS_ATTESTATION_BUNDLE: '' }).status).toBe(2);
    expect(cli(['--fault', 'unknown']).status).toBe(64);
    expect(cli(['--all'], { ...process.env, NODE_ENV: 'production' }).status).toBe(1);
  }, 60000);
  it('is absent from the real server and browser bundle import graphs', async () => {
    for (const entry of ['server/_core/index.ts', 'client/src/main.tsx', 'client/src/xaurion/world/chunkProjection.worker.ts']) {
      expect(existsSync(entry)).toBe(true);
      const result = await build({ entryPoints: [entry], bundle: true, packages: 'external', platform: entry.startsWith('server') ? 'node' : 'browser',
        format: 'esm', write: false, metafile: true, logLevel: 'silent', loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'dataurl' } });
      expect(Object.keys(result.metafile!.inputs).some(p => /causal-chaos|causalFaultInjection|run-aurion-causal-chaos/.test(p))).toBe(false);
    }
    const docker = readFileSync('Dockerfile', 'utf8');
    expect(docker).not.toMatch(/COPY[^\n]*causal-chaos/);
  }, 30000);
});
