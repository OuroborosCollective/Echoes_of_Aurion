import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aurionProgressionReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const key128 = z.string().trim().min(1).max(128);
const key96 = z.string().trim().min(1).max(96);
const key64 = z.string().trim().min(1).max(64);
const exact = z.string().regex(/^[0-9]+$/).max(128);
const MAX_CONFIRMED_PROGRESSION_TRACKS = 512;

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

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ProgressionReceiptStore = Pick<Database, "select" | "insert">;

type StoredProgressionReceiptRow = Readonly<ProgressionReceiptInput & {
  id: string;
  receiptHash: string;
}>;

export function normalizeProgressionReceipt(input: ProgressionReceiptInput) {
  const parsed = progressionReceiptInputSchema.parse(input);
  if (parsed.actionKind === "loot_claim" && !parsed.lootReceiptId) throw new Error("LOOT_RECEIPT_REQUIRED");
  if (parsed.actionKind === "weapon_use" && parsed.weaponTrack === "none") throw new Error("WEAPON_TRACK_REQUIRED");
  if (parsed.actionKind === "skill_use" && parsed.skillId === "none") throw new Error("SKILL_ID_REQUIRED");
  const receiptHash = npcHash(parsed);
  return Object.freeze({ ...parsed, receiptHash });
}

function storedInput(row: StoredProgressionReceiptRow): ProgressionReceiptInput {
  return {
    userId: row.userId,
    characterId: row.characterId,
    actionKind: row.actionKind,
    weaponTrack: row.weaponTrack,
    skillId: row.skillId,
    resultReceiptId: row.resultReceiptId,
    sourceReceiptId: row.sourceReceiptId,
    lootReceiptId: row.lootReceiptId,
    masteryEventId: row.masteryEventId,
    xpGrantedExact: row.xpGrantedExact,
    levelExact: row.levelExact,
    ruleSetVersion: row.ruleSetVersion,
    contentVersion: row.contentVersion,
    idempotencyKey: row.idempotencyKey,
  };
}

function verifyStoredProgressionReceipt(row: StoredProgressionReceiptRow) {
  let normalized: ReturnType<typeof normalizeProgressionReceipt>;
  try {
    normalized = normalizeProgressionReceipt(storedInput(row));
  } catch {
    throw new Error("PROGRESSION_RECEIPT_CORRUPT");
  }
  const expectedId = `progression_${normalized.receiptHash.slice(0, 52)}`;
  if (!/^[a-f0-9]{64}$/.test(row.receiptHash) || row.receiptHash !== normalized.receiptHash || row.id !== expectedId) {
    throw new Error("PROGRESSION_RECEIPT_CORRUPT");
  }
  return normalized;
}

/**
 * Persists a confirmed progression receipt. The optional store is used only by
 * already-open server transactions (for example an accepted group-result commit)
 * so result evidence and its read-only progression projection stay atomic.
 */
export async function recordProgressionReceipt(input: ProgressionReceiptInput, providedStore?: ProgressionReceiptStore) {
  const normalized = normalizeProgressionReceipt(input);
  const store = providedStore ?? await getDb();
  if (!store) throw new Error("Game database is not available");
  const prior = (await store.select().from(aurionProgressionReceipts).where(eq(aurionProgressionReceipts.idempotencyKey, normalized.idempotencyKey)).limit(1))[0];
  if (prior) {
    verifyStoredProgressionReceipt(prior as StoredProgressionReceiptRow);
    if (prior.receiptHash !== normalized.receiptHash || prior.userId !== normalized.userId || prior.characterId !== normalized.characterId) throw new Error("PROGRESSION_RECEIPT_IDEMPOTENCY_CONFLICT");
    return Object.freeze({ applied: false as const, id: prior.id, receiptHash: prior.receiptHash });
  }
  const idValue = `progression_${normalized.receiptHash.slice(0, 52)}`;
  await store.insert(aurionProgressionReceipts).values({ id: idValue, ...normalized });
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

/**
 * Projects only already-confirmed progression receipts. No XP curve, unlock rule or
 * gameplay calculation is executed here. Every persisted row is re-normalized and
 * re-hashed before it may contribute to the readmodel. Out-of-order ingestion is
 * resolved by the greatest confirmed exact level; ties are deterministic by hash.
 */
export function projectConfirmedProgressionTracks(rows: readonly StoredProgressionReceiptRow[]) {
  const verified = rows.map(row => ({ row, normalized: verifyStoredProgressionReceipt(row) }));
  const characterIds = [...new Set(verified.map(({ row }) => row.characterId))].sort();
  if (characterIds.length > 1) throw new Error("PROGRESSION_CHARACTER_CONFLICT");

  const tracks = new Map<string, ConfirmedProgressionTrack>();
  for (const { row } of verified) {
    const identity = row.actionKind === "weapon_use"
      ? { trackKind: "weapon" as const, trackId: row.weaponTrack }
      : row.actionKind === "skill_use"
        ? { trackKind: "skill" as const, trackId: row.skillId }
        : null;
    if (!identity) continue;
    if (!identity.trackId.trim() || identity.trackId === "none") throw new Error("PROGRESSION_TRACK_CORRUPT");

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
      if (tracks.size > MAX_CONFIRMED_PROGRESSION_TRACKS) throw new Error("PROGRESSION_TRACK_LIMIT_EXCEEDED");
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
    userId: aurionProgressionReceipts.userId,
    characterId: aurionProgressionReceipts.characterId,
    actionKind: aurionProgressionReceipts.actionKind,
    weaponTrack: aurionProgressionReceipts.weaponTrack,
    skillId: aurionProgressionReceipts.skillId,
    resultReceiptId: aurionProgressionReceipts.resultReceiptId,
    sourceReceiptId: aurionProgressionReceipts.sourceReceiptId,
    lootReceiptId: aurionProgressionReceipts.lootReceiptId,
    masteryEventId: aurionProgressionReceipts.masteryEventId,
    xpGrantedExact: aurionProgressionReceipts.xpGrantedExact,
    levelExact: aurionProgressionReceipts.levelExact,
    ruleSetVersion: aurionProgressionReceipts.ruleSetVersion,
    contentVersion: aurionProgressionReceipts.contentVersion,
    receiptHash: aurionProgressionReceipts.receiptHash,
    idempotencyKey: aurionProgressionReceipts.idempotencyKey,
  }).from(aurionProgressionReceipts)
    .where(eq(aurionProgressionReceipts.userId, userId))
    .orderBy(desc(aurionProgressionReceipts.createdAt), desc(aurionProgressionReceipts.id));
  return projectConfirmedProgressionTracks(rows as StoredProgressionReceiptRow[]);
}
