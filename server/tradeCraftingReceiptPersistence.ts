import { eq } from "drizzle-orm";
import { z } from "zod";
import { aurionTradeCraftingReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const id = z.string().trim().min(1).max(128);
const resourceDelta = z.object({ resourceId: id, quantityExact: z.string().regex(/^-?[0-9]+$/).refine(value => BigInt(value) !== 0n) }).strict();
export const tradeCraftingReceiptInputSchema = z.object({
  userId: z.number().int().positive(),
  characterId: id,
  operationKind: z.enum(["trade", "crafting"]),
  operationId: id,
  sourceReceiptId: id,
  worldRevision: id,
  marketContext: id,
  professionContext: id.nullable(),
  resourceDeltas: z.array(resourceDelta).min(1).max(32),
  resultJson: z.string().trim().min(2).max(16_384),
  resultHash: z.string().regex(/^[a-f0-9]{64}$/i),
  idempotencyKey: id,
}).strict();
export type TradeCraftingReceiptInput = z.infer<typeof tradeCraftingReceiptInputSchema>;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type ReceiptWriter = Pick<Database, "select" | "insert">;

export function normalizeTradeCraftingReceipt(input: TradeCraftingReceiptInput) {
  const parsed = tradeCraftingReceiptInputSchema.parse(input);
  if (parsed.operationKind === "crafting" && parsed.professionContext === null) throw new Error("CRAFTING_PROFESSION_CONTEXT_REQUIRED");
  const resourceDeltas = parsed.resourceDeltas.slice().sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  if (new Set(resourceDeltas.map(value => value.resourceId)).size !== resourceDeltas.length) throw new Error("RESOURCE_DELTA_DUPLICATE");
  const receiptHash = npcHash({ ...parsed, resourceDeltas });
  return Object.freeze({ ...parsed, resourceDeltas: Object.freeze(resourceDeltas), receiptHash });
}

/**
 * Persists or replays one canonical trade/crafting receipt inside the caller's
 * existing MariaDB transaction. This is the only helper AX1 crafting should use
 * while it also locks/consumes inventory and commits profession mastery, so no
 * nested transaction can split the atomic effect.
 */
export async function recordTradeCraftingReceiptInTransaction(tx: ReceiptWriter, input: TradeCraftingReceiptInput) {
  const normalized = normalizeTradeCraftingReceipt(input);
  const prior = (await tx.select().from(aurionTradeCraftingReceipts).where(eq(aurionTradeCraftingReceipts.idempotencyKey, normalized.idempotencyKey)).limit(1))[0];
  if (prior) {
    if (prior.userId !== normalized.userId || prior.characterId !== normalized.characterId || prior.operationId !== normalized.operationId || prior.receiptHash !== normalized.receiptHash) throw new Error("TRADE_CRAFTING_IDEMPOTENCY_CONFLICT");
    return Object.freeze({ applied: false as const, receiptId: prior.id, receiptHash: prior.receiptHash });
  }
  const receiptId = `trade_crafting_${normalized.receiptHash.slice(0, 48)}`;
  await tx.insert(aurionTradeCraftingReceipts).values({ id: receiptId, userId: normalized.userId, characterId: normalized.characterId, operationKind: normalized.operationKind, operationId: normalized.operationId, sourceReceiptId: normalized.sourceReceiptId, worldRevision: normalized.worldRevision, marketContext: normalized.marketContext, professionContext: normalized.professionContext, resourceDeltasJson: JSON.stringify(normalized.resourceDeltas), resultJson: normalized.resultJson, resultHash: normalized.resultHash, receiptHash: normalized.receiptHash, idempotencyKey: normalized.idempotencyKey });
  return Object.freeze({ applied: true as const, receiptId, receiptHash: normalized.receiptHash });
}

/** Backwards-compatible standalone caller; atomic AX1 crafting passes its own tx. */
export async function recordTradeCraftingReceipt(input: TradeCraftingReceiptInput) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(tx => recordTradeCraftingReceiptInTransaction(tx, input));
}
