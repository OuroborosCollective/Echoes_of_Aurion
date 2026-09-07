import { eq } from "drizzle-orm";
import { z } from "zod";
import { aurionProgressionReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const key = z.string().trim().min(1).max(128);
const exact = z.string().regex(/^[0-9]+$/);
export const progressionReceiptInputSchema = z.object({
  userId: z.number().int().positive(),
  characterId: key,
  actionKind: z.enum(["encounter", "weapon_use", "skill_use", "loot_claim"]),
  weaponTrack: key,
  skillId: key,
  resultReceiptId: key,
  sourceReceiptId: key,
  lootReceiptId: key.nullable(),
  masteryEventId: key.nullable(),
  xpGrantedExact: exact,
  levelExact: exact,
  ruleSetVersion: key,
  contentVersion: key,
  idempotencyKey: key,
}).strict();
export type ProgressionReceiptInput = z.infer<typeof progressionReceiptInputSchema>;

export function normalizeProgressionReceipt(input: ProgressionReceiptInput) {
  const parsed = progressionReceiptInputSchema.parse(input);
  if (parsed.actionKind === "loot_claim" && !parsed.lootReceiptId) throw new Error("LOOT_RECEIPT_REQUIRED");
  if (parsed.actionKind === "weapon_use" && parsed.weaponTrack === "none") throw new Error("WEAPON_TRACK_REQUIRED");
  if (parsed.actionKind === "skill_use" && parsed.skillId === "none") throw new Error("SKILL_ID_REQUIRED");
  const receiptHash = npcHash(parsed);
  return Object.freeze({ ...parsed, receiptHash });
}

export async function recordProgressionReceipt(input: ProgressionReceiptInput) {
  const normalized = normalizeProgressionReceipt(input);
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  const prior = (await db.select().from(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.idempotencyKey, normalized.idempotencyKey)).limit(1))[0];
  if (prior) {
    if (prior.receiptHash !== normalized.receiptHash || prior.userId !== normalized.userId || prior.characterId !== normalized.characterId) throw new Error("PROGRESSION_RECEIPT_IDEMPOTENCY_CONFLICT");
    return Object.freeze({ applied: false as const, id: prior.id, receiptHash: prior.receiptHash });
  }
  const idValue = `progression_receipt_${normalized.receiptHash.slice(0, 48)}`;
  await db.insert(aurionProgressionReceipts).values({ id: idValue, ...normalized });
  return Object.freeze({ applied: true as const, id: idValue, receiptHash: normalized.receiptHash });
}
