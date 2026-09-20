import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  AURION_WORLD_CHUNK_RULESET, WORLD_CHUNK_BASE_REVISION, WORLD_CHUNK_COORDINATE_LIMIT,
  createWorldChunkDelta, generateBaseWorldChunk, materializeWorldChunk,
  type WorldChunkCoordinate, type WorldChunkDelta,
} from "./worldChunkProtocol";

export const CHUNK_STATE_SCHEMA = "aurion.chunk.state.v1" as const;
export const CHUNK_RECEIPT_SCHEMA = "aurion.chunk.epoch-receipt.v1" as const;
export const CHUNK_GENERATOR_VERSION = "aurion.chunk-generator.v1" as const;
export const CHUNK_EPOCH_MAX_DELTAS = 4096;
export const CHUNK_EPOCH_MAX_CHUNKS = 64;
export const causalSha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const causalRevisionSchema = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().min(1).max(128);
export const causalCounterSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const chunkCoordinateSchema = z.strictObject({
  x: z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT),
  z: z.number().int().min(-WORLD_CHUNK_COORDINATE_LIMIT).max(WORLD_CHUNK_COORDINATE_LIMIT),
});
export const chunkUniverseSchema = z.strictObject({
  schema: z.literal("aurion.chunk-universe.v1"), worldId: identifier,
  worldSeedHash: causalSha256Schema, generatorVersion: z.literal(CHUNK_GENERATOR_VERSION),
  rulesetVersion: z.literal(AURION_WORLD_CHUNK_RULESET), baseRevision: z.literal(WORLD_CHUNK_BASE_REVISION),
});
export type ChunkUniverse = Readonly<z.infer<typeof chunkUniverseSchema>>;
export const chunkReceiptSchema = z.strictObject({
  schema: z.literal(CHUNK_RECEIPT_SCHEMA), kind: z.literal("EPOCH_SNAPSHOT"),
  worldId: identifier, epoch: causalCounterSchema.min(1), sourceRevision: causalRevisionSchema,
  coordinate: chunkCoordinateSchema, universeHash: causalSha256Schema,
  throughSequence: causalCounterSchema.max(CHUNK_EPOCH_MAX_DELTAS),
  baseStateHash: causalSha256Schema, orderedDeltaHash: causalSha256Schema,
  authorityStateHash: causalSha256Schema, previousChunkReceiptHash: causalSha256Schema.nullable(),
  receiptHash: causalSha256Schema,
});
export type CanonicalChunkReceipt = Readonly<z.infer<typeof chunkReceiptSchema>>;
const deltaSchema = z.strictObject({
  id: z.string().min(1).max(64), worldId: identifier, coordinate: chunkCoordinateSchema,
  baseRevision: z.literal(WORLD_CHUNK_BASE_REVISION), sequence: causalCounterSchema.min(1),
  kind: z.enum(["resource_depleted", "structure_placed", "structure_removed", "road_built"]),
  targetId: identifier, actorUserId: causalCounterSchema.min(1), idempotencyKey: identifier,
  payload: z.record(z.string().min(1).max(64), z.union([z.string().max(1024), z.number().finite(), z.boolean()]))
    .refine(value => Object.keys(value).length <= 16, "CHUNK_PAYLOAD_BOUND_EXCEEDED"),
  deterministicHash: z.string().regex(/^fnv1a-[a-f0-9]{8}$/),
});

export function chunkKey(coordinate: WorldChunkCoordinate): string { return `${coordinate.x}:${coordinate.z}`; }
export function compareChunks(a: WorldChunkCoordinate, b: WorldChunkCoordinate): number { return a.x - b.x || a.z - b.z; }

export function freezeEvidence<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeEvidence(child);
    Object.freeze(value);
  }
  return value;
}

export function createChunkUniverse(worldId: string, worldSeed: string): ChunkUniverse {
  identifier.parse(worldId);
  if (!worldSeed.trim() || worldSeed.length > 1024) throw new Error("CHUNK_SEED_INVALID");
  return freezeEvidence(chunkUniverseSchema.parse({
    schema: "aurion.chunk-universe.v1", worldId,
    worldSeedHash: canonicalSha256({ domain: "aurion.chunk-seed.v1", worldId, worldSeed }),
    generatorVersion: CHUNK_GENERATOR_VERSION, rulesetVersion: AURION_WORLD_CHUNK_RULESET,
    baseRevision: WORLD_CHUNK_BASE_REVISION,
  }));
}

/** Reconstruct actual state; a supplied legacy FNV digest alone is insufficient. */
export function buildCanonicalChunkState(input: {
  worldId: string; worldSeed: string; coordinate: WorldChunkCoordinate; deltas: readonly WorldChunkDelta[];
}) {
  const coordinate = chunkCoordinateSchema.parse(input.coordinate);
  const universe = createChunkUniverse(input.worldId, input.worldSeed);
  if (input.deltas.length > CHUNK_EPOCH_MAX_DELTAS) throw new Error("CHUNK_DELTA_BOUND_EXCEEDED");
  const deltas = input.deltas.map(raw => {
    const delta = deltaSchema.parse(raw);
    // Reconstruct only the authoritative, allowlisted fields (no row timestamps).
    const canonical = createWorldChunkDelta({
      id: delta.id, worldId: delta.worldId, coordinate: delta.coordinate, baseRevision: delta.baseRevision,
      sequence: delta.sequence, kind: delta.kind, targetId: delta.targetId,
      actorUserId: delta.actorUserId, idempotencyKey: delta.idempotencyKey, payload: delta.payload,
    });
    if (canonical.deterministicHash !== delta.deterministicHash) throw new Error("CHUNK_DELTA_HASH_MISMATCH");
    if (!["resource_depleted", "structure_placed", "structure_removed", "road_built"].includes(delta.kind)) throw new Error("CHUNK_DELTA_KIND_INVALID");
    if (!Number.isSafeInteger(delta.actorUserId) || delta.actorUserId < 1) throw new Error("CHUNK_DELTA_ACTOR_INVALID");
    return canonical;
  }).sort((a, b) => a.sequence - b.sequence);
  deltas.forEach((delta, index) => {
    if (delta.sequence !== index + 1) throw new Error("CHUNK_DELTA_SEQUENCE_GAP_OR_DUPLICATE");
  });
  const base = generateBaseWorldChunk({ worldId: input.worldId, worldSeed: input.worldSeed, coordinate });
  const materialized = materializeWorldChunk(base, deltas);
  const state = {
    schema: CHUNK_STATE_SCHEMA, universe, coordinate, throughSequence: deltas.length,
    baseStateHash: canonicalSha256({ domain: "aurion.chunk-base.v1", base }),
    orderedDeltaHash: canonicalSha256({ domain: "aurion.chunk-ordered-deltas.v1", deltas }),
    materialized,
  } as const;
  return freezeEvidence({ ...state, authorityStateHash: canonicalSha256(state) });
}

/** Snapshot receipt, not a retroactively invented action/tick receipt. */
export function createCanonicalChunkReceipt(input: {
  worldId: string; worldSeed: string; coordinate: WorldChunkCoordinate; deltas: readonly WorldChunkDelta[];
  epoch: number; sourceRevision: string; previousChunkReceiptHash: string | null;
}) {
  causalCounterSchema.min(1).parse(input.epoch);
  causalRevisionSchema.parse(input.sourceRevision);
  causalSha256Schema.nullable().parse(input.previousChunkReceiptHash);
  const state = buildCanonicalChunkState(input);
  const unsigned = {
    schema: CHUNK_RECEIPT_SCHEMA, kind: "EPOCH_SNAPSHOT" as const,
    worldId: input.worldId, epoch: input.epoch, sourceRevision: input.sourceRevision,
    coordinate: state.coordinate, universeHash: canonicalSha256(state.universe),
    throughSequence: state.throughSequence, baseStateHash: state.baseStateHash,
    orderedDeltaHash: state.orderedDeltaHash, authorityStateHash: state.authorityStateHash,
    previousChunkReceiptHash: input.previousChunkReceiptHash,
  };
  const receipt = freezeEvidence({ ...unsigned, receiptHash: canonicalSha256(unsigned) });
  return { state, receipt };
}

export function decodeCanonicalChunkReceipt(value: unknown): CanonicalChunkReceipt {
  const parsed = chunkReceiptSchema.parse(value);
  const { receiptHash, ...unsigned } = parsed;
  if (canonicalSha256(unsigned) !== receiptHash) throw new Error("CHUNK_RECEIPT_HASH_MISMATCH");
  return freezeEvidence(parsed);
}
