import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_SIMULATION_WORK_ORDER_PROTOCOL = "aurion.simulation-work-order.v1" as const;

export const AURION_SIMULATION_PHASES = [
  "WORLD_IMPACT",
  "ECOLOGY",
  "VITAL_NEEDS",
  "HOUSEHOLD",
  "LOCAL_ECONOMY",
  "SOCIAL_GROUP",
  "FACTION_TERRITORY",
  "GOVERNANCE",
  "LONG_HORIZON",
] as const;
export type AurionSimulationPhase = (typeof AURION_SIMULATION_PHASES)[number];

const PHASE_ORDINAL: Readonly<Record<AurionSimulationPhase, number>> = Object.freeze(Object.fromEntries(
  AURION_SIMULATION_PHASES.map((phase, index) => [phase, index + 1]),
) as Record<AurionSimulationPhase, number>);

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;

export type SimulationWorkItem = Readonly<{
  workId: string;
  phase: AurionSimulationPhase;
  entityId: string;
  actionId: string;
  resolutionIndex: number;
  sourceRevision: string;
  logicalTick: number;
  inputHash: string;
  dependencyIds: readonly string[];
}>;

export type DeferredSimulationWork = Readonly<{
  protocol: typeof AURION_SIMULATION_WORK_ORDER_PROTOCOL;
  workId: string;
  continuationOrdinal: number;
  phase: AurionSimulationPhase;
  sourceRevision: string;
  logicalTick: number;
  inputHash: string;
  deferredHash: string;
}>;

export type SimulationWorkPlan = Readonly<{
  protocol: typeof AURION_SIMULATION_WORK_ORDER_PROTOCOL;
  sourceRevision: string;
  logicalTick: number;
  inputHash: string;
  orderedWork: readonly SimulationWorkItem[];
  deferredWork: readonly DeferredSimulationWork[];
  planHash: string;
}>;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIdentity(value: string, code: string): void {
  if (!ID.test(value)) throw new Error(code);
}

function assertHash(value: string, code: string): void {
  if (!HASH.test(value)) throw new Error(code);
}

function assertRevision(value: string): void {
  if (!REVISION.test(value)) throw new Error("SIMULATION_WORK_SOURCE_REVISION_INVALID");
}

function assertNonNegativeSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

function validateWorkItem(item: SimulationWorkItem): void {
  assertIdentity(item.workId, "SIMULATION_WORK_ID_INVALID");
  assertIdentity(item.entityId, "SIMULATION_WORK_ENTITY_ID_INVALID");
  assertIdentity(item.actionId, "SIMULATION_WORK_ACTION_ID_INVALID");
  assertRevision(item.sourceRevision);
  assertHash(item.inputHash, "SIMULATION_WORK_INPUT_HASH_INVALID");
  assertNonNegativeSafeInteger(item.resolutionIndex, "SIMULATION_WORK_RESOLUTION_INDEX_INVALID");
  assertNonNegativeSafeInteger(item.logicalTick, "SIMULATION_WORK_TICK_INVALID");
  for (const dependencyId of item.dependencyIds) assertIdentity(dependencyId, "SIMULATION_WORK_DEPENDENCY_ID_INVALID");
}

export function phaseOrdinal(phase: AurionSimulationPhase): number {
  const ordinal = PHASE_ORDINAL[phase];
  if (!ordinal) throw new Error("SIMULATION_WORK_PHASE_INVALID");
  return ordinal;
}

export function compareSimulationWork(left: SimulationWorkItem, right: SimulationWorkItem): number {
  validateWorkItem(left);
  validateWorkItem(right);
  return phaseOrdinal(left.phase) - phaseOrdinal(right.phase)
    || left.resolutionIndex - right.resolutionIndex
    || compare(left.entityId, right.entityId)
    || compare(left.actionId, right.actionId)
    || compare(left.workId, right.workId);
}

export function canonicalizeSimulationWork(items: readonly SimulationWorkItem[]): readonly SimulationWorkItem[] {
  const copy = items.map(item => {
    validateWorkItem(item);
    return Object.freeze({ ...item, dependencyIds: Object.freeze([...item.dependencyIds].sort(compare)) });
  });

  const ids = new Set<string>();
  for (const item of copy) {
    if (ids.has(item.workId)) throw new Error("SIMULATION_WORK_DUPLICATE");
    ids.add(item.workId);
  }

  return Object.freeze(copy.sort(compareSimulationWork));
}

export function buildSimulationWorkPlan(input: {
  sourceRevision: string;
  logicalTick: number;
  workItems: readonly SimulationWorkItem[];
  maxWorkItems: number;
}): SimulationWorkPlan {
  assertRevision(input.sourceRevision);
  assertNonNegativeSafeInteger(input.logicalTick, "SIMULATION_WORK_TICK_INVALID");
  if (!Number.isSafeInteger(input.maxWorkItems) || input.maxWorkItems < 1) {
    throw new Error("SIMULATION_WORK_BUDGET_INVALID");
  }

  const canonical = canonicalizeSimulationWork(input.workItems);
  for (const item of canonical) {
    if (item.sourceRevision !== input.sourceRevision) throw new Error("SIMULATION_WORK_MIXED_REVISION");
    if (item.logicalTick > input.logicalTick) throw new Error("SIMULATION_WORK_FUTURE_TICK");
  }

  const orderedWork = canonical.slice(0, input.maxWorkItems);
  const deferredSource = canonical.slice(input.maxWorkItems);
  const deferredWork = Object.freeze(deferredSource.map((item, index) => {
    const continuationOrdinal = index + 1;
    return Object.freeze({
      protocol: AURION_SIMULATION_WORK_ORDER_PROTOCOL,
      workId: item.workId,
      continuationOrdinal,
      phase: item.phase,
      sourceRevision: input.sourceRevision,
      logicalTick: input.logicalTick,
      inputHash: item.inputHash,
      deferredHash: canonicalSha256({
        domain: "aurion.simulation-work.deferred.v1",
        workId: item.workId,
        continuationOrdinal,
        phase: item.phase,
        sourceRevision: input.sourceRevision,
        logicalTick: input.logicalTick,
        inputHash: item.inputHash,
      }),
    });
  }));

  const inputHash = canonicalSha256({
    domain: "aurion.simulation-work-input.v1",
    sourceRevision: input.sourceRevision,
    logicalTick: input.logicalTick,
    work: canonical,
  });

  const planHash = canonicalSha256({
    domain: AURION_SIMULATION_WORK_ORDER_PROTOCOL,
    sourceRevision: input.sourceRevision,
    logicalTick: input.logicalTick,
    maxWorkItems: input.maxWorkItems,
    orderedWork,
    deferredWork,
  });

  return Object.freeze({
    protocol: AURION_SIMULATION_WORK_ORDER_PROTOCOL,
    sourceRevision: input.sourceRevision,
    logicalTick: input.logicalTick,
    inputHash,
    orderedWork: Object.freeze(orderedWork),
    deferredWork,
    planHash,
  });
}

export function partitionSimulationWork(items: readonly SimulationWorkItem[], partitionCount: number): readonly (readonly SimulationWorkItem[])[] {
  if (!Number.isSafeInteger(partitionCount) || partitionCount < 1) throw new Error("SIMULATION_WORK_PARTITION_COUNT_INVALID");
  const canonical = canonicalizeSimulationWork(items);
  const partitions: SimulationWorkItem[][] = Array.from({ length: Math.min(partitionCount, Math.max(1, canonical.length)) }, () => []);
  canonical.forEach((item, index) => partitions[index % partitions.length]!.push(item));
  return Object.freeze(partitions.map(partition => Object.freeze(partition)));
}