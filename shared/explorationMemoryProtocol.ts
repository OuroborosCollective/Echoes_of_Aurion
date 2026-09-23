import { z } from "zod";
import { hashWorldChunkProjectionPayload } from "./worldChunkProjectionV2";

export const EXPLORATION_MEMORY_SCHEMA = "aurion.exploration-memory.v1" as const;
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const coordinate = z.number().int().min(-1_000_000).max(1_000_000);
const logicalSequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const explorationMemoryRecordSchema = z.strictObject({
  schema: z.literal(EXPLORATION_MEMORY_SCHEMA),
  userId: z.number().int().positive(),
  worldId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
  worldEpoch: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  chunkX: coordinate,
  chunkZ: coordinate,
  firstDiscoveryReceiptHash: sha256,
  latestConfirmedVisitSequence: logicalSequence,
  latestProjectionHash: sha256,
  sourceRevision: revision,
  memoryHash: sha256,
});
export type ExplorationMemoryRecord = Readonly<z.infer<typeof explorationMemoryRecordSchema>>;

export function hashExplorationMemoryRecord(input: Omit<ExplorationMemoryRecord, "memoryHash">): Promise<string> {
  const value = explorationMemoryRecordSchema.omit({ memoryHash: true }).parse(input);
  return hashWorldChunkProjectionPayload(new TextEncoder().encode(JSON.stringify([
    EXPLORATION_MEMORY_SCHEMA,
    value.userId,
    value.worldId,
    value.worldEpoch,
    value.chunkX,
    value.chunkZ,
    value.firstDiscoveryReceiptHash,
    value.latestConfirmedVisitSequence,
    value.latestProjectionHash,
    value.sourceRevision,
  ])));
}

export function createExplorationMemoryRecord(input: Omit<ExplorationMemoryRecord, "memoryHash">): Promise<ExplorationMemoryRecord> {
  return hashExplorationMemoryRecord(input).then(memoryHash => Object.freeze(
    explorationMemoryRecordSchema.parse({ ...input, memoryHash })
  ));
}
