import {
  AURION_WORLD_CHUNK_RULESET,
  WORLD_CHUNK_COORDINATE_LIMIT,
  type BaseWorldChunk,
  type WorldChunkCoordinate,
} from "./worldChunkProtocol";

/**
 * AX1 presentation contract for deterministic chunk preparation.
 *
 * This file deliberately carries only already-confirmed world identity plus
 * presentation versions. It does not generate or mutate gameplay, collision,
 * resources, quests, NPC state, loot or persistence.
 */
export const WORLD_CHUNK_PROJECTION_VERSION = "aurion-ax1-chunk-projection.v1" as const;
export const WORLD_CHUNK_PROJECTION_MAX_QUEUE = 64 as const;

export const WORLD_CHUNK_PROJECTION_STATES = [
  "absent",
  "requested",
  "received",
  "validated",
  "decoded",
  "renderable",
  "simulatable",
  "evictable",
] as const;

export type WorldChunkProjectionState = (typeof WORLD_CHUNK_PROJECTION_STATES)[number];
export type WorldChunkProjectionLayer = "base-terrain" | "world-assets" | "actor-visuals" | "ambient-effects";

export type WorldChunkProjectionManifest = Readonly<{
  version: typeof WORLD_CHUNK_PROJECTION_VERSION;
  worldId: string;
  worldSeedDigest: string;
  worldRuleSetVersion: typeof AURION_WORLD_CHUNK_RULESET;
  generatorVersion: string;
  contentVersion: string;
  coordinate: WorldChunkCoordinate;
  layer: WorldChunkProjectionLayer;
  baseRevision: number;
  sourceHash: string;
  manifestHash: string;
}>;

export type WorldChunkProjectionWorkerJob = Readonly<{
  jobId: string;
  manifest: WorldChunkProjectionManifest;
  generation: number;
  priority: number;
  enqueueSequence: number;
}>;

export type WorldChunkProjectionWorkerResult = Readonly<{
  jobId: string;
  manifestHash: string;
  projectionVersion: typeof WORLD_CHUNK_PROJECTION_VERSION;
  generation: number;
  payloadHash: string;
  byteLength: number;
}>;

const projectionLayers = new Set<WorldChunkProjectionLayer>(["base-terrain", "world-assets", "actor-visuals", "ambient-effects"]);
const projectionStates = new Set<WorldChunkProjectionState>(WORLD_CHUNK_PROJECTION_STATES);
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const hashPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$/;

function assertIdentifier(value: string, label: string): void {
  if (!identifierPattern.test(value)) throw new Error(`${label} must be a stable identifier`);
}

function assertHash(value: string, label: string): void {
  if (!hashPattern.test(value)) throw new Error(`${label} must be a stable hash identifier`);
}

function assertCoordinate(value: WorldChunkCoordinate): void {
  if (!Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.z)) throw new Error("projection chunk coordinate must use safe integers");
  if (Math.abs(value.x) > WORLD_CHUNK_COORDINATE_LIMIT || Math.abs(value.z) > WORLD_CHUNK_COORDINATE_LIMIT) throw new Error("projection chunk coordinate exceeds world boundary");
}

function assertUnsigned(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function assertPriority(value: number): void {
  if (!Number.isSafeInteger(value) || value < -1_000_000 || value > 1_000_000) throw new Error("projection priority must be a bounded safe integer");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function projectionHash(value: unknown): string {
  let hash = 2166136261;
  const text = stableStringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createWorldChunkProjectionManifest(input: {
  base: Pick<BaseWorldChunk, "worldId" | "worldSeedDigest" | "ruleSetVersion" | "coordinate" | "baseRevision" | "deterministicHash">;
  generatorVersion: string;
  contentVersion: string;
  layer: WorldChunkProjectionLayer;
}): WorldChunkProjectionManifest {
  assertIdentifier(input.base.worldId, "projection worldId");
  assertHash(input.base.worldSeedDigest, "projection worldSeedDigest");
  if (input.base.ruleSetVersion !== AURION_WORLD_CHUNK_RULESET) throw new Error("projection world ruleset mismatch");
  assertCoordinate(input.base.coordinate);
  assertUnsigned(input.base.baseRevision, "projection baseRevision");
  assertHash(input.base.deterministicHash, "projection sourceHash");
  assertIdentifier(input.generatorVersion, "projection generatorVersion");
  assertIdentifier(input.contentVersion, "projection contentVersion");
  if (!projectionLayers.has(input.layer)) throw new Error("projection layer is invalid");

  const identity = {
    version: WORLD_CHUNK_PROJECTION_VERSION,
    worldId: input.base.worldId,
    worldSeedDigest: input.base.worldSeedDigest,
    worldRuleSetVersion: input.base.ruleSetVersion,
    generatorVersion: input.generatorVersion,
    contentVersion: input.contentVersion,
    coordinate: { ...input.base.coordinate },
    layer: input.layer,
    baseRevision: input.base.baseRevision,
    sourceHash: input.base.deterministicHash,
  } as const;

  return Object.freeze({
    ...identity,
    coordinate: Object.freeze(identity.coordinate),
    manifestHash: projectionHash(identity),
  });
}

export function createWorldChunkProjectionWorkerJob(input: {
  manifest: WorldChunkProjectionManifest;
  generation: number;
  priority: number;
  enqueueSequence: number;
}): WorldChunkProjectionWorkerJob {
  assertWorldChunkProjectionManifest(input.manifest);
  assertUnsigned(input.generation, "projection generation");
  assertPriority(input.priority);
  assertUnsigned(input.enqueueSequence, "projection enqueueSequence");
  const jobIdentity = {
    manifestHash: input.manifest.manifestHash,
    generation: input.generation,
    projectionVersion: WORLD_CHUNK_PROJECTION_VERSION,
  };
  return Object.freeze({
    jobId: projectionHash(jobIdentity),
    manifest: input.manifest,
    generation: input.generation,
    priority: input.priority,
    enqueueSequence: input.enqueueSequence,
  });
}

export function createWorldChunkProjectionWorkerResult(input: {
  job: WorldChunkProjectionWorkerJob;
  payloadHash: string;
  byteLength: number;
}): WorldChunkProjectionWorkerResult {
  assertWorldChunkProjectionWorkerJob(input.job);
  assertHash(input.payloadHash, "projection payloadHash");
  assertUnsigned(input.byteLength, "projection byteLength");
  return Object.freeze({
    jobId: input.job.jobId,
    manifestHash: input.job.manifest.manifestHash,
    projectionVersion: WORLD_CHUNK_PROJECTION_VERSION,
    generation: input.job.generation,
    payloadHash: input.payloadHash,
    byteLength: input.byteLength,
  });
}

export function assertWorldChunkProjectionManifest(manifest: WorldChunkProjectionManifest): void {
  if (manifest.version !== WORLD_CHUNK_PROJECTION_VERSION) throw new Error("projection manifest version mismatch");
  assertIdentifier(manifest.worldId, "projection worldId");
  assertHash(manifest.worldSeedDigest, "projection worldSeedDigest");
  if (manifest.worldRuleSetVersion !== AURION_WORLD_CHUNK_RULESET) throw new Error("projection world ruleset mismatch");
  assertIdentifier(manifest.generatorVersion, "projection generatorVersion");
  assertIdentifier(manifest.contentVersion, "projection contentVersion");
  assertCoordinate(manifest.coordinate);
  if (!projectionLayers.has(manifest.layer)) throw new Error("projection layer is invalid");
  assertUnsigned(manifest.baseRevision, "projection baseRevision");
  assertHash(manifest.sourceHash, "projection sourceHash");
  const { manifestHash, ...identity } = manifest;
  if (projectionHash(identity) !== manifestHash) throw new Error("projection manifest hash mismatch");
}

export function assertWorldChunkProjectionWorkerJob(job: WorldChunkProjectionWorkerJob): void {
  assertWorldChunkProjectionManifest(job.manifest);
  assertUnsigned(job.generation, "projection generation");
  assertPriority(job.priority);
  assertUnsigned(job.enqueueSequence, "projection enqueueSequence");
  const expectedJobId = projectionHash({
    manifestHash: job.manifest.manifestHash,
    generation: job.generation,
    projectionVersion: WORLD_CHUNK_PROJECTION_VERSION,
  });
  if (job.jobId !== expectedJobId) throw new Error("projection job identity mismatch");
}

export function matchesWorldChunkProjectionWorkerResult(expected: WorldChunkProjectionWorkerJob, candidate: WorldChunkProjectionWorkerResult): boolean {
  assertWorldChunkProjectionWorkerJob(expected);
  if (candidate.projectionVersion !== WORLD_CHUNK_PROJECTION_VERSION) return false;
  if (!Number.isSafeInteger(candidate.generation) || candidate.generation < 0) return false;
  if (!Number.isSafeInteger(candidate.byteLength) || candidate.byteLength < 0) return false;
  if (!hashPattern.test(candidate.payloadHash)) return false;
  return candidate.jobId === expected.jobId && candidate.manifestHash === expected.manifest.manifestHash && candidate.generation === expected.generation;
}

/** Highest priority first, then monotone enqueue sequence and stable identity. */
export function orderWorldChunkProjectionWorkerQueue(jobs: readonly WorldChunkProjectionWorkerJob[], maxJobs = WORLD_CHUNK_PROJECTION_MAX_QUEUE): readonly WorldChunkProjectionWorkerJob[] {
  if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > WORLD_CHUNK_PROJECTION_MAX_QUEUE) throw new Error(`projection maxJobs must be 1..${WORLD_CHUNK_PROJECTION_MAX_QUEUE}`);
  const unique = new Map<string, WorldChunkProjectionWorkerJob>();
  for (const job of jobs) {
    assertWorldChunkProjectionWorkerJob(job);
    const previous = unique.get(job.jobId);
    if (!previous || job.priority > previous.priority || (job.priority === previous.priority && job.enqueueSequence < previous.enqueueSequence)) unique.set(job.jobId, job);
  }
  return Object.freeze(Array.from(unique.values()).sort((left, right) => right.priority - left.priority || left.enqueueSequence - right.enqueueSequence || (left.jobId < right.jobId ? -1 : left.jobId > right.jobId ? 1 : 0)).slice(0, maxJobs));
}

const allowedTransitions: Readonly<Record<WorldChunkProjectionState, ReadonlySet<WorldChunkProjectionState>>> = Object.freeze({
  absent: new Set<WorldChunkProjectionState>(["requested"]),
  requested: new Set<WorldChunkProjectionState>(["received", "absent"]),
  received: new Set<WorldChunkProjectionState>(["validated", "absent"]),
  validated: new Set<WorldChunkProjectionState>(["decoded", "absent"]),
  decoded: new Set<WorldChunkProjectionState>(["renderable", "absent"]),
  renderable: new Set<WorldChunkProjectionState>(["simulatable", "evictable"]),
  simulatable: new Set<WorldChunkProjectionState>(["evictable"]),
  evictable: new Set<WorldChunkProjectionState>(["absent"]),
});

export function canTransitionWorldChunkProjectionState(current: WorldChunkProjectionState, next: WorldChunkProjectionState): boolean {
  if (!projectionStates.has(current) || !projectionStates.has(next)) return false;
  return allowedTransitions[current].has(next);
}

export function transitionWorldChunkProjectionState(current: WorldChunkProjectionState, next: WorldChunkProjectionState): WorldChunkProjectionState {
  if (!canTransitionWorldChunkProjectionState(current, next)) throw new Error(`invalid projection state transition ${current} -> ${next}`);
  return next;
}
