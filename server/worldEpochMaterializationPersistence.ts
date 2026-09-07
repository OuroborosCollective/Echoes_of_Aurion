import { eq } from "drizzle-orm";
import { z } from "zod";
import { aurionWorldEpochMaterializations } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const id = z.string().trim().min(1).max(128);
const presence = z.object({ userId: z.number().int().positive(), chunkX: z.number().int(), chunkZ: z.number().int(), resolutionIndex: z.number().int().positive() }).strict();
export const epochMaterializationInputSchema = z.object({
  worldId: id,
  epoch: z.number().int().positive(),
  resolutionIndex: z.number().int().positive(),
  reactionReceiptId: id,
  reactionHash: z.string().regex(/^[a-f0-9]{64}$/i),
  presence: z.array(presence).max(10_000),
  materializationJson: z.string().min(2).max(64_000),
  idempotencyKey: id,
}).strict();
export type EpochMaterializationInput = z.infer<typeof epochMaterializationInputSchema>;

export function normalizeEpochMaterialization(input: EpochMaterializationInput) {
  const parsed = epochMaterializationInputSchema.parse(input);
  if (parsed.resolutionIndex !== parsed.epoch) throw new Error("EPOCH_RESOLUTION_MISMATCH");
  if (parsed.presence.some(entry => entry.resolutionIndex !== parsed.resolutionIndex)) throw new Error("PRESENCE_RESOLUTION_MISMATCH");
  const orderedPresence = parsed.presence.slice().sort((a, b) => a.userId - b.userId || a.chunkX - b.chunkX || a.chunkZ - b.chunkZ);
  const presenceDigest = npcHash(orderedPresence);
  const materializationHash = npcHash({ worldId: parsed.worldId, epoch: parsed.epoch, resolutionIndex: parsed.resolutionIndex, reactionReceiptId: parsed.reactionReceiptId, reactionHash: parsed.reactionHash, presenceDigest, materializationJson: parsed.materializationJson });
  return Object.freeze({ ...parsed, presence: Object.freeze(orderedPresence), presenceDigest, materializationHash });
}

export async function recordEpochMaterialization(input: EpochMaterializationInput) {
  const normalized = normalizeEpochMaterialization(input);
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  const prior = (await db.select().from(aurionWorldEpochMaterializations).where(eq(aurionWorldEpochMaterializations.idempotencyKey, normalized.idempotencyKey)).limit(1))[0];
  if (prior) {
    if (prior.materializationHash !== normalized.materializationHash || prior.worldId !== normalized.worldId || prior.epoch !== normalized.epoch) throw new Error("EPOCH_MATERIALIZATION_IDEMPOTENCY_CONFLICT");
    return Object.freeze({ applied: false as const, id: prior.id, materializationHash: prior.materializationHash });
  }
  const idValue = `epoch_materialization_${normalized.materializationHash.slice(0, 48)}`;
  await db.insert(aurionWorldEpochMaterializations).values({ id: idValue, worldId: normalized.worldId, epoch: normalized.epoch, resolutionIndex: normalized.resolutionIndex, reactionReceiptId: normalized.reactionReceiptId, reactionHash: normalized.reactionHash, presenceDigest: normalized.presenceDigest, presenceJson: JSON.stringify(normalized.presence), materializationJson: normalized.materializationJson, materializationHash: normalized.materializationHash, idempotencyKey: normalized.idempotencyKey });
  return Object.freeze({ applied: true as const, id: idValue, materializationHash: normalized.materializationHash });
}
