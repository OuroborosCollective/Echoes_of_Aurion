import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  CHUNK_EPOCH_MAX_CHUNKS, CHUNK_EPOCH_MAX_DELTAS, causalCounterSchema, causalRevisionSchema, causalSha256Schema,
  chunkKey, chunkReceiptSchema, chunkUniverseSchema, compareChunks, createCanonicalChunkReceipt,
  createChunkUniverse, decodeCanonicalChunkReceipt, freezeEvidence, type ChunkUniverse,
} from "./aurionChunkStateContract";
import {
  computeWorldCausalRoot, verifyWorldCausalRoot,
  type AurionWorldCausalRootResult, type AurionWorldCausalRoot,
} from "./aurionWorldCausalRootContract";
import type { WorldChunkDelta } from "./worldChunkProtocol";

export const WORLD_CHUNK_ROOT_SCHEMA = "aurion.world.causal-root.v2" as const;
export const WORLD_CHUNK_ROOT_RESULT_SCHEMA = "aurion.world.causal-root-result.v2" as const;
export const WORLD_CHUNK_ROOT_MAX_BYTES = 60_000; // existing MariaDB TEXT, no migration
const zoneRootSchema = z.strictObject({
  worldId: z.string().min(1).max(128), zoneId: z.string().min(1).max(128),
  sourceRevision: causalRevisionSchema, rulesetVersion: z.string().min(1).max(128),
  fromTick: causalCounterSchema, toTick: causalCounterSchema, firstReceiptHash: causalSha256Schema,
  lastReceiptHash: causalSha256Schema, zoneRootHash: causalSha256Schema,
});
const worldRootV2Schema = z.strictObject({
  schema: z.literal(WORLD_CHUNK_ROOT_SCHEMA), worldId: z.string().min(1).max(128),
  epoch: causalCounterSchema.min(1), sourceRevision: causalRevisionSchema, rulesetVersion: z.string().min(1).max(128),
  zoneRoots: z.array(zoneRootSchema).min(1).max(64), previousWorldRoot: causalSha256Schema.nullable(),
  chunkUniverse: chunkUniverseSchema, chunkReceipts: z.array(chunkReceiptSchema).max(CHUNK_EPOCH_MAX_CHUNKS),
  chunkSetHash: causalSha256Schema, worldRootHash: causalSha256Schema,
});
export type ChunkWorldRoot = Readonly<z.infer<typeof worldRootV2Schema>>;
export type ChunkWorldRootResult = Readonly<{
  schema: typeof WORLD_CHUNK_ROOT_RESULT_SCHEMA; status: "VERIFIED"; root: ChunkWorldRoot;
  evidenceHash: string; reason: null; missingZoneIds: readonly string[]; unexpectedZoneIds: readonly string[];
}> | Readonly<{
  schema: typeof WORLD_CHUNK_ROOT_RESULT_SCHEMA; status: "UNPROVABLE"; root: null;
  evidenceHash: string; reason: string; missingZoneIds: readonly string[]; unexpectedZoneIds: readonly string[];
}>;
export type AnyWorldRootResult = AurionWorldCausalRootResult | ChunkWorldRootResult;

function chunkSetHash(universe: ChunkUniverse, receipts: readonly z.infer<typeof chunkReceiptSchema>[]): string {
  return canonicalSha256({
    domain: "aurion.chunk-epoch-set.v1", universe,
    streams: receipts.map(r => ({ coordinate: r.coordinate, throughSequence: r.throughSequence, receiptHash: r.receiptHash })),
  });
}

export function unprovableChunkWorldRoot(input: { worldId: string; epoch: number; sourceRevision: string }, reason: string): ChunkWorldRootResult {
  return freezeEvidence({
    schema: WORLD_CHUNK_ROOT_RESULT_SCHEMA, status: "UNPROVABLE", root: null,
    evidenceHash: canonicalSha256({ schema: WORLD_CHUNK_ROOT_RESULT_SCHEMA, worldId: input.worldId, epoch: input.epoch, sourceRevision: input.sourceRevision, reason }), reason,
    missingZoneIds: [], unexpectedZoneIds: [],
  });
}

/** Only the epoch transaction may claim this complete committed-delta snapshot. */
export function buildChunkWorldRoot(input: {
  zoneResult: AurionWorldCausalRootResult; worldId: string; epoch: number; sourceRevision: string;
  worldSeed: string; deltas: readonly WorldChunkDelta[]; previous: AnyWorldRootResult | null;
}): ChunkWorldRootResult {
  const fail = (reason: string) => unprovableChunkWorldRoot(input, reason);
  if (input.zoneResult.status !== "VERIFIED") return fail(input.zoneResult.reason);
  if (input.previous && input.previous.status !== "VERIFIED") return fail("PREVIOUS_WORLD_ROOT_UNPROVABLE");
  if (input.deltas.length > CHUNK_EPOCH_MAX_DELTAS) return fail("CHUNK_DELTA_BOUND_EXCEEDED");
  try {
    const zoneRoot = input.zoneResult.root;
    if (zoneRoot.worldId !== input.worldId || zoneRoot.epoch !== input.epoch || zoneRoot.sourceRevision !== input.sourceRevision || !verifyWorldCausalRoot(zoneRoot)) return fail("ZONE_ROOT_IDENTITY_MISMATCH");
    if (zoneRoot.previousWorldRoot !== (input.previous?.root?.worldRootHash ?? null)) return fail("PREVIOUS_WORLD_ROOT_MISMATCH");
    if (input.previous?.status === "VERIFIED" && (input.previous.root.worldId !== input.worldId || input.previous.root.epoch + 1 !== input.epoch || !verifyAnyWorldRoot(input.previous.root))) return fail("PREVIOUS_WORLD_ROOT_INVALID");
    if (!input.previous && input.epoch !== 1) return fail("PREVIOUS_WORLD_ROOT_MISSING");
    const chunkUniverse = createChunkUniverse(input.worldId, input.worldSeed);
    if (input.previous?.status === "VERIFIED" && input.previous.root.schema === WORLD_CHUNK_ROOT_SCHEMA && canonicalSha256(input.previous.root.chunkUniverse) !== canonicalSha256(chunkUniverse)) return fail("CHUNK_UNIVERSE_CHANGED");
    const byChunk = new Map<string, WorldChunkDelta[]>();
    for (const delta of input.deltas) {
      if (delta.worldId !== input.worldId) return fail("CHUNK_WORLD_MISMATCH");
      const key = chunkKey(delta.coordinate);
      const stream = byChunk.get(key) ?? [];
      stream.push(delta); byChunk.set(key, stream);
    }
    if (byChunk.size > CHUNK_EPOCH_MAX_CHUNKS) return fail("CHUNK_SET_BOUND_EXCEEDED");
    const previousReceipts = input.previous?.status === "VERIFIED" && input.previous.root.schema === WORLD_CHUNK_ROOT_SCHEMA ? input.previous.root.chunkReceipts : [];
    if (previousReceipts.some(r => !byChunk.has(chunkKey(r.coordinate)))) return fail("CHUNK_STREAM_DISAPPEARED");
    const chunkReceipts = [...byChunk.values()].map(deltas => {
      const coordinate = deltas[0]!.coordinate;
      const previous = previousReceipts.find(r => chunkKey(r.coordinate) === chunkKey(coordinate));
      if (previous && deltas.length < previous.throughSequence) throw new Error("CHUNK_SEQUENCE_REGRESSION");
      if (previous) {
        const historical = createCanonicalChunkReceipt({ ...input, coordinate, deltas: deltas.filter(d => d.sequence <= previous.throughSequence), epoch: previous.epoch, sourceRevision: previous.sourceRevision, previousChunkReceiptHash: previous.previousChunkReceiptHash });
        if (historical.receipt.receiptHash !== previous.receiptHash) throw new Error("CHUNK_HISTORY_CHANGED");
      }
      return createCanonicalChunkReceipt({ ...input, coordinate, deltas, previousChunkReceiptHash: previous?.receiptHash ?? null }).receipt;
    }).sort((a, b) => compareChunks(a.coordinate, b.coordinate));
    const { worldRootHash: _v1Hash, ...zoneIdentity } = zoneRoot;
    const unsigned = { ...zoneIdentity, schema: WORLD_CHUNK_ROOT_SCHEMA, chunkUniverse, chunkReceipts, chunkSetHash: chunkSetHash(chunkUniverse, chunkReceipts) };
    const root = { ...unsigned, worldRootHash: canonicalSha256(unsigned) };
    const result: ChunkWorldRootResult = freezeEvidence({
      schema: WORLD_CHUNK_ROOT_RESULT_SCHEMA, status: "VERIFIED", root: decodeChunkWorldRoot(root),
      evidenceHash: root.worldRootHash, reason: null, missingZoneIds: [], unexpectedZoneIds: [],
    });
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > WORLD_CHUNK_ROOT_MAX_BYTES) return fail("WORLD_ROOT_STORAGE_BOUND_EXCEEDED");
    return result;
  } catch { return fail("CHUNK_STATE_OR_HISTORY_INVALID"); }
}

/** Integrity and internal identity checks, not independent DB replay. */
export function decodeChunkWorldRoot(value: unknown): ChunkWorldRoot {
  const root = worldRootV2Schema.parse(value);
  if (root.chunkUniverse.worldId !== root.worldId) throw new Error("CHUNK_UNIVERSE_WORLD_MISMATCH");
  const zoneCheck = computeWorldCausalRoot({ ...root, expectedZoneIds: root.zoneRoots.map(r => r.zoneId), previousWorldRootProvable: true });
  if (zoneCheck.status !== "VERIFIED") throw new Error("ZONE_ROOT_INVALID");
  if (canonicalSha256(zoneCheck.root.zoneRoots) !== canonicalSha256(root.zoneRoots)) throw new Error("ZONE_ROOT_ORDER_INVALID");
  const universeHash = canonicalSha256(root.chunkUniverse);
  let count = 0;
  root.chunkReceipts.forEach((r, index) => {
    decodeCanonicalChunkReceipt(r);
    if (r.worldId !== root.worldId || r.epoch !== root.epoch || r.sourceRevision !== root.sourceRevision || r.universeHash !== universeHash || r.throughSequence < 1) throw new Error("CHUNK_RECEIPT_IDENTITY_MISMATCH");
    if (index && compareChunks(root.chunkReceipts[index - 1]!.coordinate, r.coordinate) >= 0) throw new Error("CHUNK_SET_ORDER_OR_DUPLICATE");
    count += r.throughSequence;
  });
  if (count > CHUNK_EPOCH_MAX_DELTAS) throw new Error("CHUNK_DELTA_BOUND_EXCEEDED");
  if (chunkSetHash(root.chunkUniverse, root.chunkReceipts) !== root.chunkSetHash) throw new Error("CHUNK_SET_HASH_MISMATCH");
  const { worldRootHash, ...unsigned } = root;
  if (canonicalSha256(unsigned) !== worldRootHash) throw new Error("WORLD_ROOT_HASH_MISMATCH");
  return freezeEvidence(root);
}

export function verifyAnyWorldRoot(root: AurionWorldCausalRoot | ChunkWorldRoot): boolean {
  try { return root.schema === WORLD_CHUNK_ROOT_SCHEMA ? !!decodeChunkWorldRoot(root) : verifyWorldCausalRoot(root); }
  catch { return false; }
}

export function parseAnyWorldRootResult(json: string): AnyWorldRootResult | null {
  try {
    if (Buffer.byteLength(json, "utf8") > WORLD_CHUNK_ROOT_MAX_BYTES) return null;
    const result = JSON.parse(json) as AnyWorldRootResult;
    if (result?.schema !== "aurion.world.causal-root-result.v1" && result?.schema !== WORLD_CHUNK_ROOT_RESULT_SCHEMA) return null;
    z.strictObject({
      schema: z.enum(["aurion.world.causal-root-result.v1", WORLD_CHUNK_ROOT_RESULT_SCHEMA]),
      status: z.enum(["VERIFIED", "UNPROVABLE"]), root: z.unknown(), evidenceHash: causalSha256Schema,
      reason: z.string().min(1).max(256).nullable(), missingZoneIds: z.array(z.string()).max(64), unexpectedZoneIds: z.array(z.string()).max(64),
    }).parse(result);
    if (result.status === "VERIFIED") {
      if (result.reason !== null || result.missingZoneIds.length || result.unexpectedZoneIds.length) return null;
      if (!result.root || result.evidenceHash !== result.root.worldRootHash || !verifyAnyWorldRoot(result.root)) return null;
      if ((result.schema === WORLD_CHUNK_ROOT_RESULT_SCHEMA) !== (result.root.schema === WORLD_CHUNK_ROOT_SCHEMA)) return null;
    } else if (result.status !== "UNPROVABLE" || result.root !== null || typeof result.reason !== "string" || !causalSha256Schema.safeParse(result.evidenceHash).success) return null;
    return freezeEvidence(result);
  } catch { return null; }
}
