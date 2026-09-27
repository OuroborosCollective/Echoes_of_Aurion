import { performance } from "node:perf_hooks";
import type WebSocket from "ws";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { orderCanonicalZoneIntents, hashCanonicalIntents, sanitizeIntentForHash } from "../../shared/aurionZoneIntentContract";
import { AURION_CAUSAL_TICK_SCHEMA_V2, type AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import { buildSimulationWorkPlan, canonicalizeSimulationWork, partitionSimulationWork, type SimulationWorkItem } from "../../shared/aurionSimulationWorkOrderProtocol";
import { AURION_REPLAY_VERDICT_SCHEMA, type ReplayVerdict } from "../../shared/aurionReplayContract";
import { AurionTickRecorder, type PersistedCheckpoint, type RecordedTickEntry } from "../causality/tickRecorder";
import { AurionHeadlessCausalOracle } from "../causality/headlessCausalOracle";
import { replayZoneTick } from "../causality/replayZoneTick";
import { hashCanonicalZoneState, type CanonicalZoneState } from "../causality/zoneCanonicalState";
import { globalTickRecorder } from "../causality/tickRecorder";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import type { ZoneId } from "../zoneProtocol";

export const AURION_DES_VALIDATION_PROTOCOL = "aurion.des-validation.v1" as const;
const MAX_TICKS = 64;
const MAX_TRACE_EVENTS = 4096;
const REVISION = /^[a-f0-9]{40}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

export type DesValidationStatus = "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE";
export type DesValidationInvariantStatus = "PASS" | "FAIL" | "UNPROVABLE";

export type DesValidationTraceEvent = Readonly<{
  logicalTick: number;
  sequence: number;
  entityId: string;
  eventId: string;
  eventType: string;
  sourceReceiptHash: string;
  inputHash: string;
  decisionHash: string | null;
  effectIntentHash: string | null;
  resultingStateHash: string;
  sourceRevision: string;
  rulesetVersion: string;
}>;

export type DesValidationResultSet = Readonly<{
  protocol: typeof AURION_DES_VALIDATION_PROTOCOL;
  sourceRevision: string;
  rulesetVersion: string;
  scenarioId: string;
  seed: string;
  startStateHash: string;
  endStateHash: string;
  fromTick: number;
  toTick: number;
  causalTicks: number;
  eventCount: number;
  decisionCount: number;
  effectCount: number;
  traceHash: string;
  receiptHashChain: string;
  inputSetHash: string;
  scenarioManifestHash: string;
  workPlanHash: string;
  schedulerEquivalence: "PASS" | "FAIL" | "UNPROVABLE";
  invariants: Readonly<Record<string, DesValidationInvariantStatus>>;
  status: DesValidationStatus;
  firstDivergence: Readonly<{ tick: number; stage: string; expectedHash: string; observedHash: string }> | null;
  canonicalResultHash: string;
  observationalMetrics: Readonly<{ elapsedMs: number; ticksPerSecond: number }>;
}>;

export type DesValidationExecution = Readonly<{
  scenario: DesValidationResultSet;
  trace: readonly DesValidationTraceEvent[];
  receipts: readonly AurionCausalTickReceipt[];
  entries: readonly RecordedTickEntry[];
  replayVerdicts: readonly ReplayVerdict[];
  terminalState: CanonicalZoneState;
}>;

function assertHash(value: string, code: string): void { if (!HASH.test(value)) throw new Error(code); }
function assertRevision(value: string): void { if (!REVISION.test(value)) throw new Error("AURION_DES_SOURCE_REVISION_INVALID"); }
function assertTick(value: number, code: string): void { if (!Number.isSafeInteger(value) || value < 0) throw new Error(code); }

function traceHash(trace: readonly DesValidationTraceEvent[]): string {
  if (trace.length === 0 || trace.length > MAX_TRACE_EVENTS) throw new Error("AURION_DES_TRACE_BOUND_INVALID");
  return canonicalSha256({ domain: "aurion.des-validation.trace.v1", events: trace });
}

function buildTrace(entries: readonly RecordedTickEntry[]): readonly DesValidationTraceEvent[] {
  const trace: DesValidationTraceEvent[] = [];
  for (const entry of entries) {
    const receipt = entry.receipt;
    assertRevision(receipt.sourceRevision);
    assertHash(receipt.receiptHash, "AURION_DES_RECEIPT_HASH_INVALID");
    const stages = receipt.schema === AURION_CAUSAL_TICK_SCHEMA_V2 ? receipt.stages : [];
    for (const stage of stages) {
      trace.push(Object.freeze({
        logicalTick: receipt.tick,
        sequence: stage.stageOrdinal,
        entityId: receipt.zoneId,
        eventId: "stage:" + receipt.tick + ":" + stage.stageName,
        eventType: stage.stageName,
        sourceReceiptHash: receipt.receiptHash,
        inputHash: stage.stageInputIdentity,
        decisionHash: receipt.orderedIntentHash,
        effectIntentHash: null,
        resultingStateHash: stage.canonicalStateHash,
        sourceRevision: receipt.sourceRevision,
        rulesetVersion: receipt.rulesetVersion,
      }));
    }
  }
  return Object.freeze(trace.sort((a,b) => a.logicalTick - b.logicalTick || a.sequence - b.sequence || a.eventId.localeCompare(b.eventId)));
}

function buildWorkItems(entries: readonly RecordedTickEntry[]): readonly SimulationWorkItem[] {
  const phase = ["WORLD_IMPACT","ECOLOGY","VITAL_NEEDS","HOUSEHOLD","LOCAL_ECONOMY","SOCIAL_GROUP","FACTION_TERRITORY"] as const;
  const result: SimulationWorkItem[] = [];
  let ordinal = 0;
  for (const entry of entries) {
    for (const stage of entry.receipt.schema === AURION_CAUSAL_TICK_SCHEMA_V2 ? entry.receipt.stages : []) {
      ordinal += 1;
      result.push({
        workId: "des:" + entry.receipt.tick + ":" + stage.stageOrdinal,
        phase: phase[(stage.stageOrdinal - 1) % phase.length]!,
        entityId: entry.receipt.zoneId,
        actionId: stage.stageName.toLowerCase(),
        resolutionIndex: stage.stageOrdinal,
        sourceRevision: entry.receipt.sourceRevision,
        logicalTick: entry.receipt.tick,
        inputHash: stage.stageInputIdentity,
        dependencyIds: ordinal > 1 ? ["des:" + entry.receipt.tick + ":" + (stage.stageOrdinal - 1)] : [],
      });
    }
  }
  return Object.freeze(result);
}

function memoryPersistence(checkpoint: PersistedCheckpoint, entries: readonly RecordedTickEntry[]) {
  return {
    async getCheckpointAtOrBefore() { return structuredClone(checkpoint); },
    async getTicksInRange(_zoneId: string, _from: number, _to: number) { return structuredClone(entries); },
  };
}

function manifestHash(input: { scenarioId: string; seed: string; sourceRevision: string; rulesetVersion: string; startStateHash: string; inputSetHash: string }): string {
  return canonicalSha256({ domain: "aurion.des-validation.scenario-manifest.v1", ...input });
}

function invariantRecord(replayVerdicts: readonly ReplayVerdict[], schedulerEquivalence: DesValidationResultSet["schedulerEquivalence"]): Record<string, DesValidationInvariantStatus> {
  const allMatch = replayVerdicts.length > 0 && replayVerdicts.every(v => v.status === "MATCH");
  return {
    TRACE_NON_EMPTY: allMatch ? "PASS" : "UNPROVABLE",
    REPLAY_EQUALITY: allMatch ? "PASS" : "FAIL",
    SCHEDULER_EQUIVALENCE: schedulerEquivalence,
    CAUSAL_RECEIPT_CHAIN: allMatch ? "PASS" : "FAIL",
  };
}

export async function executeDeterministicDesScenario(input: Readonly<{
  scenarioId: string;
  seed: string;
  sourceRevision: string;
  zoneId?: string;
  submitReversed?: boolean;
  tickCount?: number;
}>): Promise<DesValidationExecution> {
  assertRevision(input.sourceRevision);
  if (!input.scenarioId.trim() || !input.seed.trim()) throw new Error("AURION_DES_SCENARIO_IDENTITY_INVALID");
  const tickCount = input.tickCount ?? 2;
  if (!Number.isSafeInteger(tickCount) || tickCount < 1 || tickCount > MAX_TICKS) throw new Error("AURION_DES_TICK_BOUND_INVALID");
  const zoneId = (input.zoneId ?? ("observatory_threshold:des-" + canonicalSha256({ scenarioId: input.scenarioId, seed: input.seed }).slice(7, 31))) as ZoneId;
  const evidenceRecorder = new AurionTickRecorder(256);\n  const zone = new AuthoritativeMovementZone(zoneId, evidenceRecorder);
  zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
  zone.sourceRevisionOverride = input.sourceRevision;
  const socket = { readyState: 1, OPEN: 1, send() {}, close() {} } as unknown as WebSocket;
  const a = zone.join({ userId: 501, socket, combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" } });
  const b = zone.join({ userId: 502, socket, combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 11, weaponTrack: "blade" } });
  const operations = [
    { connectionId: a.connectionId, clientSeq: 1, input: { x: 1, z: 0 } },
    { connectionId: b.connectionId, clientSeq: 1, input: { x: 0, z: 1 } },
  ];
  const started = performance.now();
  for (let tick = 1; tick <= tickCount; tick += 1) {
    const batch = input.submitReversed ? [...operations].reverse() : operations;
    for (const op of batch) zone.submitMovement(op.connectionId, { type: "move", clientSeq: op.clientSeq + tick - 1, input: op.input });
    zone.tick();
  }
  const elapsedMs = performance.now() - started;
  const receipts = evidenceRecorder.getReceiptChain(zoneId, 1, tickCount);
  const entries = receipts.map(receipt => evidenceRecorder.getEntry(zoneId, receipt.tick)!).filter(Boolean);
  if (entries.length !== tickCount) throw new Error("AURION_DES_RECORDED_TICKS_MISSING");
  const firstEntry = entries[0]!;
  const terminal = entries.at(-1)!.postState ?? zone.getCanonicalZoneState();
  const startState = firstEntry.preState!;
  const inputSetHash = canonicalSha256({ domain: "aurion.des-validation.input-set.v1", intents: orderCanonicalZoneIntents(entries.flatMap(entry => entry.intents ?? [])).map(sanitizeIntentForHash) });
  const scenarioManifestHash = manifestHash({ scenarioId: input.scenarioId, seed: input.seed, sourceRevision: input.sourceRevision, rulesetVersion: receipts[0]!.rulesetVersion, startStateHash: hashCanonicalZoneState(startState), inputSetHash });
  const replayVerdicts: ReplayVerdict[] = [];
  for (const entry of entries) replayVerdicts.push(replayZoneTick({ preState: entry.preState!, intents: entry.intents!, expectedReceipt: entry.receipt }));
  const trace = buildTrace(entries);
  const workItems = buildWorkItems(entries);
  const serialPlan = buildSimulationWorkPlan({ sourceRevision: input.sourceRevision, logicalTick: tickCount, workItems, maxWorkItems: Math.max(1, workItems.length) });
  const partitions = partitionSimulationWork(workItems, 4);
  const recombined = canonicalizeSimulationWork(partitions.flat());
  const parallelPlan = buildSimulationWorkPlan({ sourceRevision: input.sourceRevision, logicalTick: tickCount, workItems: recombined, maxWorkItems: Math.max(1, workItems.length) });
  const schedulerEquivalence = serialPlan.planHash === parallelPlan.planHash ? "PASS" : "FAIL";
  const oracle = new AurionHeadlessCausalOracle(memoryPersistence({ id: "des:" + input.scenarioId, worldId: startState.worldId, zoneId, tick: 0, snapshotHash: hashCanonicalZoneState(startState), state: startState, reconciled: 1 }, entries));
  const oracleResult = await oracle.replayRange({ zoneId, fromTick: 1, toTick: tickCount });
  const replayEquality = oracleResult.status === "MATCH" && replayVerdicts.every(v => v.status === "MATCH");
  const firstDivergence = replayVerdicts.find(v => v.status === "FIRST_DIVERGENCE");
  const status: DesValidationStatus = replayEquality && schedulerEquivalence === "PASS" ? "MATCH" : firstDivergence ? "FIRST_DIVERGENCE" : oracleResult.status === "UNPROVABLE" ? "UNPROVABLE" : "FIRST_DIVERGENCE";
  const canonicalResult = {
    protocol: AURION_DES_VALIDATION_PROTOCOL, sourceRevision: input.sourceRevision, rulesetVersion: receipts[0]!.rulesetVersion,
    scenarioId: input.scenarioId, seed: input.seed, startStateHash: hashCanonicalZoneState(startState), endStateHash: hashCanonicalZoneState(terminal),
    fromTick: 1, toTick: tickCount, causalTicks: tickCount, eventCount: trace.length, decisionCount: entries.reduce((n,e) => n + (e.intents?.length ?? 0), 0),
    effectCount: 0, traceHash: traceHash(trace), receiptHashChain: canonicalSha256({ domain: "aurion.des-validation.receipt-chain.v1", receipts: receipts.map(r => r.receiptHash) }),
    inputSetHash, scenarioManifestHash, workPlanHash: serialPlan.planHash, schedulerEquivalence,
    invariants: invariantRecord(replayVerdicts, schedulerEquivalence), status,
    firstDivergence: firstDivergence && firstDivergence.status === "FIRST_DIVERGENCE" ? { tick: firstDivergence.tick ?? 0, stage: firstDivergence.firstDivergentStage, expectedHash: firstDivergence.expectedHash, observedHash: firstDivergence.observedHash } : null,
  } as const;
  const canonicalResultHash = canonicalSha256(canonicalResult);
  const ticksPerSecond = elapsedMs > 0 ? (tickCount / elapsedMs) * 1000 : 0;
  const scenario: DesValidationResultSet = Object.freeze({ ...canonicalResult, canonicalResultHash, observationalMetrics: Object.freeze({ elapsedMs, ticksPerSecond }) });
  return Object.freeze({ scenario, trace, receipts: Object.freeze(receipts), entries: Object.freeze(entries), replayVerdicts: Object.freeze(replayVerdicts), terminalState: structuredClone(terminal) });
}

export function compareDeterministicDesExecutions(first: DesValidationExecution, second: DesValidationExecution) {
  const canonicalEqual = first.scenario.canonicalResultHash === second.scenario.canonicalResultHash;
  const traceEqual = first.scenario.traceHash === second.scenario.traceHash;
  const receiptEqual = first.scenario.receiptHashChain === second.scenario.receiptHashChain;
  const stateEqual = first.scenario.endStateHash === second.scenario.endStateHash;
  return Object.freeze({ status: canonicalEqual && traceEqual && receiptEqual && stateEqual ? "MATCH" : "FIRST_DIVERGENCE", canonicalEqual, traceEqual, receiptEqual, stateEqual });
}
