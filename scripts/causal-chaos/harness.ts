// Test/CLI only. Never import from a runtime entrypoint or expose through a route.
import type WebSocket from 'ws';
import { readFile } from 'node:fs/promises';
import { AuthoritativeMovementZone } from '../../server/zoneRuntime';
import { AurionHeadlessCausalOracle } from '../../server/causality/headlessCausalOracle';
import { replayZoneTick } from '../../server/causality/replayZoneTick';
import { hashCanonicalZoneState } from '../../server/causality/zoneCanonicalState';
import type { PersistedCheckpoint, RecordedTickEntry } from '../../server/causality/tickRecorder';
import { AURION_CAUSAL_TICK_SCHEMA_V2, computeReceiptHash, type AurionCausalTickReceiptV2 } from '../../shared/aurionCausalTickContract';
import { createEffectIntent, verifyEffectIntent } from '../../shared/aurionEffectIntentContract';
import { createWorldChunkProjectionManifestV2, createWorldChunkProjectionWorkerJobV2, hashWorldChunkProjectionPayload } from '../../shared/worldChunkProjectionV2';
import { CHUNK_ASSET_PROJECTION_POLICY, decodeChunkAssetWorkerPayload } from '../../shared/worldChunkProjectionPayload';
import { createClientVerificationReceipt, AURION_CLIENT_VERIFICATION_SCHEMA } from '../../shared/aurionClientVerificationContract';
import { AurionClientVerificationService } from '../../server/causality/clientVerificationService';
import { parseLateMigrationSql, compareTableContract, type ObservedTable } from '../aurionProductionSchemaReconciliation';
import { verifyAttestationTamper } from './attestation.mjs';

export const FAULT_BOUNDARIES = {
  SOURCE_REVISION_MISMATCH: 'SOURCE_REVISION', SNAPSHOT_MISMATCH: 'CHECKPOINT_HASH',
  INPUT_DIGEST_MISMATCH: 'INPUT_ORDER', RNG_DIVERGENCE: 'RNG_ROOT',
  MOVEMENT_DIVERGENCE: 'MOVEMENT', PLAYER_ACTION_DIVERGENCE: 'PLAYER_ACTION',
  MOB_FSM_DIVERGENCE: 'MOB_FSM', MOB_COMBAT_DIVERGENCE: 'MOB_COMBAT',
  EFFECT_INTENT_DIVERGENCE: 'EFFECT_INTENT', PROJECTION_DIVERGENCE: 'PROJECTION_PAYLOAD',
  CLIENT_VERIFICATION_FAILURE: 'CLIENT_OBSERVATION', ATTESTATION_TAMPER: 'ATTESTATION_SUBJECT',
  SCHEMA_DRIFT: 'SCHEMA_CONTRACT',
} as const;
export type Fault = keyof typeof FAULT_BOUNDARIES;
const badHash = `sha256:${'f'.repeat(64)}`;
const revision = 'a'.repeat(40);

export function assertTestIsolation() {
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL || process.env.AURION_SCHEMA_DATABASE_URL) {
    throw new Error('CAUSAL_CHAOS_REQUIRES_OFFLINE_TEST_ENVIRONMENT');
  }
}

function fixture() {
  assertTestIsolation();
  const zone = new AuthoritativeMovementZone('observatory_threshold:chaos-test' as any);
  zone.isReplay = true;
  zone.sourceRevisionOverride = revision;
  zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
  const socket = { send() { throw Error('CHAOS_NETWORK_FORBIDDEN'); }, close() { throw Error('CHAOS_NETWORK_FORBIDDEN'); } } as unknown as WebSocket;
  const { connectionId } = zone.join({ userId: 30001, socket });
  const state = zone.getCanonicalZoneState();
  const checkpoint: PersistedCheckpoint = { id: 'isolated-chaos', worldId: state.worldId, zoneId: state.zoneId,
    tick: 0, state, snapshotHash: hashCanonicalZoneState(state), reconciled: 0 };
  const entries: RecordedTickEntry[] = [], states = [state];
  for (let tick = 1; tick <= 2; tick++) {
    zone.submitMovement(connectionId, { type: 'move', clientSeq: tick, input: { x: 1, z: 0 } });
    const intents = structuredClone([...zone.getPendingIntents()]);
    zone.tick();
    entries.push({ receipt: zone.getLatestReceipt()!, intents });
    states.push(zone.getCanonicalZoneState());
  }
  const oracle = (cp = checkpoint, rows = entries) => new AurionHeadlessCausalOracle({
    async getCheckpointAtOrBefore() { return structuredClone(cp); },
    async getTicksInRange() { return structuredClone(rows); },
  }).replayRange({ zoneId: state.zoneId, fromTick: 1, toTick: 2 });
  return { checkpoint, entries, states, oracle };
}

async function projection(receiptHash: string, stateHash: string) {
  // Explicitly synthetic public chunk payload, bound to a real isolated tick receipt.
  const bytes = new TextEncoder().encode(JSON.stringify({ schema: 'aurion.chunk-payload.v2', worldId: 'chaos-fixture', epoch: 1,
    coordinate: { x: 0, z: 0 }, chunkSizeMm: 64000, structures: [], roads: [] }));
  const manifest = await createWorldChunkProjectionManifestV2({ version: 'aurion-ax1-chunk-projection.v2', worldId: 'chaos-fixture',
    worldSeedDigest: stateHash, worldRuleSetVersion: 'aurion-world-chunk.v1', generatorVersion: 'isolated-fixture',
    contentVersion: CHUNK_ASSET_PROJECTION_POLICY, coordinate: { x: 0, z: 0 }, layer: 'world-assets', baseRevision: 1,
    sourceHash: stateHash, authorityReceiptHash: receiptHash, authorityStateHash: stateHash, worldCausalRoot: stateHash,
    projectionSchemaVersion: 'aurion.chunk-payload.v2', projectionPolicy: CHUNK_ASSET_PROJECTION_POLICY,
    payloadHash: await hashWorldChunkProjectionPayload(bytes), byteLength: bytes.length });
  return { bytes, job: await createWorldChunkProjectionWorkerJobV2({ manifest, generation: 1 }) };
}

export async function runFault(fault: Fault, attestation?: Parameters<typeof verifyAttestationTamper>[0]) {
  if (!Object.hasOwn(FAULT_BOUNDARIES, fault)) throw Error('CAUSAL_CHAOS_UNKNOWN_FAULT');
  const f = fixture(), baseline = await f.oracle();
  if (baseline.status !== 'MATCH') throw Error('CAUSAL_CHAOS_BASELINE_FAILED');
  const before = JSON.stringify({ checkpoint: f.checkpoint, entries: f.entries });
  const receipt = f.entries[1]!.receipt as AurionCausalTickReceiptV2;
  let observed: Record<string, any>, verifiedStages: string[] = [];
  const boundary = FAULT_BOUNDARIES[fault];
  if (fault === 'SOURCE_REVISION_MISMATCH') {
    const rows = structuredClone(f.entries);
    rows[1]!.receipt.sourceRevision = 'b'.repeat(40);
    const result = await f.oracle(f.checkpoint, rows);
    observed = { status: result.status, boundary: result.reason === 'ORACLE_SOURCE_REVISION_DRIFT:2' ? 'SOURCE_REVISION' : result.firstDivergence?.stage,
      reason: result.reason, oracleResultHash: result.oracleResultHash };
    verifiedStages = result.verifiedTicks.map(t => `TICK:${t}`);
  } else if (fault === 'SNAPSHOT_MISMATCH') {
    const result = await f.oracle({ ...f.checkpoint, snapshotHash: badHash });
    observed = { status: result.status, boundary: result.firstDivergence?.stage, oracleResultHash: result.oracleResultHash };
  } else if (['INPUT_DIGEST_MISMATCH', 'RNG_DIVERGENCE', 'MOVEMENT_DIVERGENCE', 'PLAYER_ACTION_DIVERGENCE', 'MOB_FSM_DIVERGENCE', 'MOB_COMBAT_DIVERGENCE'].includes(fault)) {
    const changed = structuredClone(receipt);
    if (fault === 'INPUT_DIGEST_MISMATCH') changed.orderedIntentHash = badHash;
    else if (fault === 'RNG_DIVERGENCE') changed.rngRootHash = badHash;
    else changed.stages.find(s => s.stageName === boundary)!.canonicalStateHash = badHash;
    changed.receiptHash = computeReceiptHash(changed);
    const result = replayZoneTick({ preState: f.states[1]!, intents: f.entries[1]!.intents!, expectedReceipt: changed });
    const rows = [f.entries[0]!, { ...f.entries[1]!, receipt: changed }];
    const oracle = await f.oracle(f.checkpoint, rows);
    observed = { status: result.status, boundary: result.firstDivergentStage, expectedHash: result.expectedHash,
      observedHash: result.observedHash, oracleBoundary: oracle.firstDivergence?.stage, oracleResultHash: oracle.oracleResultHash };
    verifiedStages = result.verifiedStages;
  } else if (fault === 'EFFECT_INTENT_DIVERGENCE') {
    const intent = createEffectIntent({ authorityReceiptHash: receipt.receiptHash, effectType: 'fixture.notification', subjectId: 'player:30001', ordinal: 0, payload: { text: 'confirmed' } });
    if (!verifyEffectIntent(intent)) throw Error('EFFECT_BASELINE_FAILED');
    observed = { status: verifyEffectIntent({ ...intent, payload: { text: 'tampered' } }) ? 'MATCH' : 'FIRST_DIVERGENCE', boundary };
    verifiedStages = ['AUTHORITY_REPLAY', 'EFFECT_IDENTITY'];
  } else if (fault === 'PROJECTION_DIVERGENCE' || fault === 'CLIENT_VERIFICATION_FAILURE') {
    const { job, bytes } = await projection(receipt.receiptHash, receipt.postStateHash);
    await decodeChunkAssetWorkerPayload(job, bytes);
    verifiedStages = ['AUTHORITY_REPLAY', 'PROJECTION_MANIFEST'];
    if (fault === 'PROJECTION_DIVERGENCE') {
      const changed = new Uint8Array(bytes); changed[0] ^= 1;
      let reason: string | null = null;
      try { await decodeChunkAssetWorkerPayload(job, changed); } catch (error) { reason = (error as Error).message; }
      observed = { status: reason === 'PROJECTION_WORKER_PAYLOAD_MISMATCH' ? 'FIRST_DIVERGENCE' : reason ? 'UNPROVABLE' : 'MATCH', boundary, reason };
    } else {
      const binding = { connectionId: 'isolated-connection', clientSessionId: 'isolated-session' };
      const service = new AurionClientVerificationService(binding, { now: () => 1000 });
      await service.expectApply(job);
      const result = await service.observe(await createClientVerificationReceipt({ schema: AURION_CLIENT_VERIFICATION_SCHEMA,
        ...binding, serverReceiptHash: receipt.receiptHash, projectionHash: badHash, appliedGeneration: 1, observedAtLogicalFrame: 1 }));
      observed = { status: result.status, boundary, trust: result.trust, mutationAuthority: result.mutationAuthority };
      verifiedStages.push('PROJECTION_PAYLOAD'); service.close();
    }
  } else if (fault === 'SCHEMA_DRIFT') {
    const migration = parseLateMigrationSql('0041_aurion_content_hash_ledger', await readFile(new URL('../../drizzle/0041_aurion_content_hash_ledger.sql', import.meta.url), 'utf8'));
    const expected = migration.tables.find(t => t.name === 'aurionContentHashLedger')!;
    const table: ObservedTable = { name: expected.name, checks: expected.checks, triggers: expected.triggers,
      columns: expected.columns.map(c => ({ name: c.name, columnType: c.sqlType, nullable: c.nullable })),
      indexes: expected.indexes.map(i => ({ name: i.name.replace(/^inline_unique:/, ''), unique: i.unique, columns: [...i.columns] })) };
    if (compareTableContract(expected, table).length) throw Error('SCHEMA_BASELINE_FAILED');
    const drift = compareTableContract(expected, { ...table, triggers: table.triggers!.slice(1) });
    observed = { status: drift.length ? 'FIRST_DIVERGENCE' : 'MATCH', boundary, drift };
    verifiedStages = ['SCHEMA_BASELINE'];
  } else {
    observed = verifyAttestationTamper(attestation);
    verifiedStages = observed.baseline === 'MATCH' ? ['ATTESTATION_BASELINE'] : [];
  }
  const expectedStatus = fault === 'SOURCE_REVISION_MISMATCH' ? 'UNPROVABLE' : fault === 'CLIENT_VERIFICATION_FAILURE' ? 'CLIENT_CONTRADICTED' : 'FIRST_DIVERGENCE';
  const unchanged = before === JSON.stringify({ checkpoint: f.checkpoint, entries: f.entries });
  if (!unchanged) throw Error('CAUSAL_CHAOS_FIXTURE_MUTATED');
  const detected = observed.status === expectedStatus && observed.boundary === boundary &&
    (!('oracleBoundary' in observed) || observed.oracleBoundary === boundary);
  return { fault, expectedBoundary: boundary, detected, baseline: 'MATCH', baselineHash: baseline.oracleResultHash,
    verifiedStages, observed, fixtureUnchanged: unchanged, mutationAuthority: 'none', evidenceKind: 'isolated-test' };
}
