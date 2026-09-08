import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aurionProgressionReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const key128 = z.string().trim().min(1).max(128);
const key96 = z.string().trim().min(1).max(96);
const key64 = z.string().trim().min(1).max(64);
const exact = z.string().regex(/^[0-9]+$/).max(128);
export const progressionReceiptInputSchema = z.object({
  userId: z.number().int().positive(),
  characterId: key128,
  actionKind: z.enum(["encounter", "weapon_use", "skill_use", "loot_claim"]),
  weaponTrack: key64,
  skillId: key96,
  resultReceiptId: key128,
  sourceReceiptId: key128,
  lootReceiptId: key128.nullable(),
  masteryEventId: key128.nullable(),
  xpGrantedExact: exact,
  levelExact: exact,
  ruleSetVersion: key96,
  contentVersion: key96,
  idempotencyKey: key128,
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
  const idValue = `progression_${normalized.receiptHash.slice(0, 52)}`;
  await db.insert(aurionProgressionReceipts).values({ id: idValue, ...normalized });
  return Object.freeze({ applied: true as const, id: idValue, receiptHash: normalized.receiptHash });
}

export type ConfirmedProgressionTrack = Readonly<{
  trackKind: "weapon" | "skill";
  trackId: string;
  characterId: string;
  levelExact: string;
  resultReceiptId: string;
  sourceReceiptId: string;
  receiptHash: string;
}>;

type StoredProgressionTrackRow = Readonly<{
  id: string;
  characterId: string;
  actionKind: "encounter" | "weapon_use" | "skill_use" | "loot_claim";
  weaponTrack: string;
  skillId: string;
  levelExact: string;
  resultReceiptId: string;
  sourceReceiptId: string;
  receiptHash: string;
}>;

/**
 * Projects only already-confirmed progression receipts. No XP curve, unlock rule or
 * gameplay calculation is executed here. Out-of-order ingestion is resolved by the
 * greatest confirmed exact level; ties are deterministic by receipt hash.
 */
export function projectConfirmedProgressionTracks(rows: readonly StoredProgressionTrackRow[]) {
  const characterIds = [...new Set(rows.map(row => row.characterId))].sort();
  if (characterIds.length > 1) throw new Error("PROGRESSION_CHARACTER_CONFLICT");

  const tracks = new Map<string, ConfirmedProgressionTrack>();
  for (const row of rows) {
    const identity = row.actionKind === "weapon_use"
      ? { trackKind: "weapon" as const, trackId: row.weaponTrack }
      : row.actionKind === "skill_use"
        ? { trackKind: "skill" as const, trackId: row.skillId }
        : null;
    if (!identity) continue;
    if (!identity.trackId.trim() || identity.trackId === "none" || !/^[0-9]+$/.test(row.levelExact)) throw new Error("PROGRESSION_TRACK_CORRUPT");

    const keyValue = `${identity.trackKind}:${identity.trackId}`;
    const candidate: ConfirmedProgressionTrack = Object.freeze({
      ...identity,
      characterId: row.characterId,
      levelExact: row.levelExact,
      resultReceiptId: row.resultReceiptId,
      sourceReceiptId: row.sourceReceiptId,
      receiptHash: row.receiptHash,
    });
    const current = tracks.get(keyValue);
    const candidateLevel = BigInt(candidate.levelExact);
    const currentLevel = current ? BigInt(current.levelExact) : null;
    if (!current || candidateLevel > currentLevel! ||
      (candidateLevel === currentLevel && candidate.receiptHash > current.receiptHash)) {
      tracks.set(keyValue, candidate);
    }
  }

  return Object.freeze({
    characterId: characterIds[0] ?? null,
    tracks: Object.freeze([...tracks.values()].sort((left, right) =>
      left.trackKind.localeCompare(right.trackKind) || left.trackId.localeCompare(right.trackId))),
  });
}

export async function readConfirmedProgressionTracks(userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("PROGRESSION_USER_INVALID");
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const rows = await db.select({
    id: aurionProgressionReceipts.id,
    characterId: aurionProgressionReceipts.characterId,
    actionKind: aurionProgressionReceipts.actionKind,
    weaponTrack: aurionProgressionReceipts.weaponTrack,
    skillId: aurionProgressionReceipts.skillId,
    levelExact: aurionProgressionReceipts.levelExact,
    resultReceiptId: aurionProgressionReceipts.resultReceiptId,
    sourceReceiptId: aurionProgressionReceipts.sourceReceiptId,
    receiptHash: aurionProgressionReceipts.receiptHash,
  }).from(aurionProgressionReceipts)
    .where(eq(aurionProgressionReceipts.userId, userId))
    .orderBy(desc(aurionProgressionReceipts.createdAt), desc(aurionProgressionReceipts.id));
  return projectConfirmedProgressionTracks(rows);
}
