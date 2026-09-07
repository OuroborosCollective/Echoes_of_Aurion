import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { aurionNpcMemoryReceipts, aurionNpcQuestOffers } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const id = z.string().trim().min(1).max(128);
const hash64 = z.string().regex(/^[a-f0-9]{64}$/i);
const memoryEntry = z.string().trim().min(1).max(240);
const questOffer = z.object({
  offerId: id,
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  sourceResolutionIndex: z.number().int().nonnegative(),
  reviewOnly: z.literal(true),
}).strict();

export const npcMemoryQuestInputSchema = z.object({
  userId: z.number().int().positive(),
  characterId: id,
  npcId: id,
  worldRevision: id,
  resultReceiptId: id,
  resolutionIndex: z.number().int().nonnegative(),
  idempotencyKey: id,
  memoryEntries: z.array(memoryEntry).max(128),
  questOffer: questOffer.nullable(),
}).strict();
export type NpcMemoryQuestInput = z.infer<typeof npcMemoryQuestInputSchema>;

export function normalizeNpcMemoryQuestInput(input: NpcMemoryQuestInput) {
  const parsed = npcMemoryQuestInputSchema.parse(input);
  if (parsed.questOffer && parsed.questOffer.sourceResolutionIndex !== parsed.resolutionIndex) throw new Error("NPC_QUEST_OFFER_RESOLUTION_INVALID");
  const memoryHash = npcHash({ characterId: parsed.characterId, npcId: parsed.npcId, worldRevision: parsed.worldRevision, resultReceiptId: parsed.resultReceiptId, resolutionIndex: parsed.resolutionIndex, memoryEntries: parsed.memoryEntries });
  const offerHash = parsed.questOffer ? npcHash({ ...parsed.questOffer, characterId: parsed.characterId, npcId: parsed.npcId, worldRevision: parsed.worldRevision, resultReceiptId: parsed.resultReceiptId }) : null;
  return Object.freeze({ ...parsed, memoryHash, offerHash });
}

export async function recordNpcMemoryAndQuestOffer(input: NpcMemoryQuestInput) {
  const normalized = normalizeNpcMemoryQuestInput(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const prior = (await tx.select().from(aurionNpcMemoryReceipts).where(eq(aurionNpcMemoryReceipts.idempotencyKey, normalized.idempotencyKey)).limit(1))[0];
    if (prior) {
      if (prior.userId !== normalized.userId || prior.characterId !== normalized.characterId || prior.resultReceiptId !== normalized.resultReceiptId || prior.memoryHash !== normalized.memoryHash) throw new Error("NPC_MEMORY_IDEMPOTENCY_CONFLICT");
      const offer = normalized.questOffer ? (await tx.select().from(aurionNpcQuestOffers).where(and(eq(aurionNpcQuestOffers.memoryReceiptId, prior.id), eq(aurionNpcQuestOffers.offerHash, normalized.offerHash!))).limit(1))[0] : undefined;
      return Object.freeze({ applied: false as const, memoryReceiptId: prior.id, questOfferId: offer?.id ?? null, memoryHash: prior.memoryHash });
    }
    const memoryReceiptId = `npc_memory_${npcHash([normalized.userId, normalized.characterId, normalized.npcId, normalized.resultReceiptId]).slice(0, 48)}`;
    await tx.insert(aurionNpcMemoryReceipts).values({ id: memoryReceiptId, userId: normalized.userId, characterId: normalized.characterId, npcId: normalized.npcId, worldRevision: normalized.worldRevision, resultReceiptId: normalized.resultReceiptId, resolutionIndex: normalized.resolutionIndex, memoryJson: JSON.stringify(normalized.memoryEntries), memoryHash: normalized.memoryHash, idempotencyKey: normalized.idempotencyKey });
    let questOfferId: string | null = null;
    if (normalized.questOffer) {
      questOfferId = `npc_offer_${npcHash([memoryReceiptId, normalized.questOffer.offerId]).slice(0, 48)}`;
      await tx.insert(aurionNpcQuestOffers).values({ id: questOfferId, memoryReceiptId, userId: normalized.userId, characterId: normalized.characterId, npcId: normalized.npcId, worldRevision: normalized.worldRevision, resultReceiptId: normalized.resultReceiptId, resolutionIndex: normalized.resolutionIndex, offerKey: normalized.questOffer.offerId, offerJson: JSON.stringify(normalized.questOffer), offerHash: normalized.offerHash!, reviewOnly: 1 });
    }
    return Object.freeze({ applied: true as const, memoryReceiptId, questOfferId, memoryHash: normalized.memoryHash });
  });
}

export function assertNpcMemoryReceiptRow(row: { userId: number; characterId: string; npcId: string; worldRevision: string; resultReceiptId: string; resolutionIndex: number; memoryJson: string; memoryHash: string }) {
  const memoryEntries = z.array(memoryEntry).max(128).parse(JSON.parse(row.memoryJson));
  const expected = npcHash({ characterId: row.characterId, npcId: row.npcId, worldRevision: row.worldRevision, resultReceiptId: row.resultReceiptId, resolutionIndex: row.resolutionIndex, memoryEntries });
  if (!hash64.safeParse(row.memoryHash).success || expected !== row.memoryHash) throw new Error("NPC_MEMORY_RECEIPT_CORRUPT");
  return Object.freeze({ ...row, memoryEntries });
}
