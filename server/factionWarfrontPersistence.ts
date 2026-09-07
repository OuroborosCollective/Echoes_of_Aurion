import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aurionFactionWarfrontReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const faction = z.string().trim().min(2).max(96);
const id = z.string().trim().min(1).max(128);
const warfrontState = z.object({
  frontId: id,
  phase: z.enum(["calm", "skirmish", "siege", "recovery"]),
  controlBps: z.number().int().min(0).max(10_000),
  conflictPressureBps: z.number().int().min(0).max(10_000),
  civilianSafetyBps: z.number().int().min(0).max(10_000),
}).strict();

export const factionWarfrontInputSchema = z.object({
  userId: z.number().int().positive(),
  characterId: id,
  faction,
  worldRevision: id,
  sourceReceiptId: id,
  sequence: z.number().int().nonnegative(),
  idempotencyKey: id,
  standingDeltaBps: z.number().int().min(-10_000).max(10_000),
  loyaltyDeltaBps: z.number().int().min(-10_000).max(10_000),
  warfront: warfrontState,
}).strict();
export type FactionWarfrontInput = z.infer<typeof factionWarfrontInputSchema>;

export function normalizeFactionWarfront(input: FactionWarfrontInput) {
  const parsed = factionWarfrontInputSchema.parse(input);
  const stateHash = npcHash({ characterId: parsed.characterId, faction: parsed.faction, worldRevision: parsed.worldRevision, sourceReceiptId: parsed.sourceReceiptId, sequence: parsed.sequence, standingDeltaBps: parsed.standingDeltaBps, loyaltyDeltaBps: parsed.loyaltyDeltaBps, warfront: parsed.warfront });
  return Object.freeze({ ...parsed, stateHash });
}

export async function recordFactionWarfront(input: FactionWarfrontInput) {
  const normalized = normalizeFactionWarfront(input);
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const prior = (await tx.select().from(aurionFactionWarfrontReceipts).where(eq(aurionFactionWarfrontReceipts.idempotencyKey, normalized.idempotencyKey)).limit(1))[0];
    if (prior) {
      if (prior.userId !== normalized.userId || prior.characterId !== normalized.characterId || prior.sourceReceiptId !== normalized.sourceReceiptId || prior.stateHash !== normalized.stateHash) throw new Error("FACTION_WARFRONT_IDEMPOTENCY_CONFLICT");
      return Object.freeze({ applied: false as const, receiptId: prior.id, stateHash: prior.stateHash });
    }
    const previous = (await tx.select().from(aurionFactionWarfrontReceipts).where(and(eq(aurionFactionWarfrontReceipts.userId, normalized.userId), eq(aurionFactionWarfrontReceipts.characterId, normalized.characterId), eq(aurionFactionWarfrontReceipts.faction, normalized.faction))).orderBy(desc(aurionFactionWarfrontReceipts.sequence)).limit(1).for("update"))[0];
    if (previous && normalized.sequence <= previous.sequence) throw new Error("FACTION_WARFRONT_SEQUENCE_CONFLICT");
    const idValue = `faction_warfront_${normalized.stateHash.slice(0, 48)}`;
    await tx.insert(aurionFactionWarfrontReceipts).values({ id: idValue, userId: normalized.userId, characterId: normalized.characterId, faction: normalized.faction, worldRevision: normalized.worldRevision, sourceReceiptId: normalized.sourceReceiptId, sequence: normalized.sequence, standingDeltaBps: normalized.standingDeltaBps, loyaltyDeltaBps: normalized.loyaltyDeltaBps, warfrontJson: JSON.stringify(normalized.warfront), stateHash: normalized.stateHash, idempotencyKey: normalized.idempotencyKey });
    return Object.freeze({ applied: true as const, receiptId: idValue, stateHash: normalized.stateHash });
  });
}
