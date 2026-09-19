import { desc, eq, inArray } from "drizzle-orm";
import {
  aurionCausalTickReceipts,
  aurionEffectDeliveryReceipts,
  aurionEffectIntents,
} from "../../drizzle/aurionCausalitySchema";
import {
  createEffectDeliveryReceipt,
  createEffectIntent,
  verifyEffectDeliveryReceipt,
  verifyEffectIntent,
  type AurionEffectDeliveryReceipt,
  type AurionEffectDeliveryState,
  type AurionEffectIntent,
} from "../../shared/aurionEffectIntentContract";
import { getDb } from "../db";
import { operationalDate } from "../../shared/operationalClock";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type PersistedAurionEffectIntent = AurionEffectIntent & Readonly<{
  deliveryState: AurionEffectDeliveryState;
  attemptCount: number;
  providerReceiptHash: string | null;
  lastErrorCode: string | null;
}>;

export type AurionEffectDeliveryOutcome = Readonly<{
  deliveryState: Exclude<AurionEffectDeliveryState, "PENDING">;
  providerReceiptHash: string | null;
  errorCode: string | null;
}>;

export type AurionEffectExplanation = Readonly<{
  intent: PersistedAurionEffectIntent;
  receipts: readonly AurionEffectDeliveryReceipt[];
  receiptChainValid: boolean;
}>;

function parseIntentRow(row: typeof aurionEffectIntents.$inferSelect): PersistedAurionEffectIntent {
  const intent: AurionEffectIntent = {
    schema: "aurion.effect-intent.v1",
    effectId: row.effectId,
    authorityReceiptHash: row.authorityReceiptHash,
    effectType: row.effectType,
    subjectId: row.subjectId,
    ordinal: row.ordinal,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    payloadHash: row.payloadHash,
  };
  if (!verifyEffectIntent(intent)) throw new Error("EFFECT_INTENT_PERSISTED_HASH_MISMATCH");
  return Object.freeze({
    ...intent,
    deliveryState: row.deliveryState,
    attemptCount: row.attemptCount,
    providerReceiptHash: row.providerReceiptHash,
    lastErrorCode: row.lastErrorCode,
  });
}

export class AurionEffectJournal {
  async recordIntent(input: {
    authorityReceiptHash: string;
    effectType: string;
    subjectId: string;
    ordinal: number;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<PersistedAurionEffectIntent> {
    const intent = createEffectIntent(input);
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");

    return db.transaction(async tx => {
      const [authorityReceipt] = await tx.select({ receiptHash: aurionCausalTickReceipts.receiptHash })
        .from(aurionCausalTickReceipts)
        .where(eq(aurionCausalTickReceipts.receiptHash, intent.authorityReceiptHash))
        .limit(1);
      if (!authorityReceipt) throw new Error("EFFECT_AUTHORITY_RECEIPT_UNPROVABLE");

      await tx.insert(aurionEffectIntents).values({
        effectId: intent.effectId,
        authorityReceiptHash: intent.authorityReceiptHash,
        effectType: intent.effectType,
        subjectId: intent.subjectId,
        ordinal: intent.ordinal,
        payloadHash: intent.payloadHash,
        payloadJson: JSON.stringify(intent.payload),
        deliveryState: "PENDING",
        attemptCount: 0,
      }).onDuplicateKeyUpdate({ set: { effectId: intent.effectId } });

      const [row] = await tx.select().from(aurionEffectIntents)
        .where(eq(aurionEffectIntents.effectId, intent.effectId))
        .limit(1)
        .for("update");
      if (!row) throw new Error("EFFECT_INTENT_PERSISTENCE_FAILED");
      const persisted = parseIntentRow(row);
      if (
        persisted.authorityReceiptHash !== intent.authorityReceiptHash ||
        persisted.effectType !== intent.effectType ||
        persisted.subjectId !== intent.subjectId ||
        persisted.ordinal !== intent.ordinal ||
        persisted.payloadHash !== intent.payloadHash ||
        JSON.stringify(persisted.payload) !== JSON.stringify(intent.payload)
      ) {
        throw new Error("EFFECT_INTENT_IDEMPOTENCY_CONFLICT");
      }
      return persisted;
    });
  }

  async readIntent(effectId: string): Promise<PersistedAurionEffectIntent | null> {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(aurionEffectIntents)
      .where(eq(aurionEffectIntents.effectId, effectId)).limit(1);
    return row ? parseIntentRow(row) : null;
  }

  async listReady(limit = 32): Promise<PersistedAurionEffectIntent[]> {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(aurionEffectIntents)
      .where(inArray(aurionEffectIntents.deliveryState, ["PENDING", "RETRYABLE", "FAILED"]))
      .orderBy(aurionEffectIntents.createdAt)
      .limit(Math.max(1, Math.min(256, limit)));
    return rows.map(parseIntentRow);
  }

  async withDeliveryLock(
    effectId: string,
    deliver: (intent: PersistedAurionEffectIntent, attempt: number) => Promise<AurionEffectDeliveryOutcome>,
  ): Promise<{ intent: PersistedAurionEffectIntent; receipt: AurionEffectDeliveryReceipt | null; skipped: boolean }> {
    const db = await getDb();
    if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");

    return db.transaction(async tx => {
      const [row] = await tx.select().from(aurionEffectIntents)
        .where(eq(aurionEffectIntents.effectId, effectId)).limit(1).for("update");
      if (!row) throw new Error("EFFECT_INTENT_NOT_FOUND");
      const current = parseIntentRow(row);
      if (current.deliveryState === "DELIVERED" || current.deliveryState === "PERMANENT_FAILURE") {
        return { intent: current, receipt: null, skipped: true };
      }

      const attempt = current.attemptCount + 1;
      const [previous] = await tx.select({ deliveryReceiptHash: aurionEffectDeliveryReceipts.deliveryReceiptHash })
        .from(aurionEffectDeliveryReceipts)
        .where(eq(aurionEffectDeliveryReceipts.effectId, effectId))
        .orderBy(desc(aurionEffectDeliveryReceipts.attempt))
        .limit(1);

      const outcome = await deliver(current, attempt);
      const receipt = createEffectDeliveryReceipt({
        effectId,
        attempt,
        deliveryState: outcome.deliveryState,
        providerReceiptHash: outcome.providerReceiptHash,
        errorCode: outcome.errorCode,
        previousDeliveryReceiptHash: previous?.deliveryReceiptHash ?? null,
      });
      await tx.insert(aurionEffectDeliveryReceipts).values({
        id: `edrc_${receipt.deliveryReceiptHash.slice("sha256:".length)}`,
        effectId,
        attempt,
        deliveryState: receipt.deliveryState,
        providerReceiptHash: receipt.providerReceiptHash,
        errorCode: receipt.errorCode,
        deliveryReceiptHash: receipt.deliveryReceiptHash,
        previousDeliveryReceiptHash: receipt.previousDeliveryReceiptHash,
        receiptJson: JSON.stringify(receipt),
      });
      await tx.update(aurionEffectIntents).set({
        deliveryState: outcome.deliveryState,
        attemptCount: attempt,
        providerReceiptHash: outcome.providerReceiptHash,
        lastErrorCode: outcome.errorCode,
        deliveredAt: outcome.deliveryState === "DELIVERED" ? operationalDate() : null,
      }).where(eq(aurionEffectIntents.effectId, effectId));

      const [updated] = await tx.select().from(aurionEffectIntents)
        .where(eq(aurionEffectIntents.effectId, effectId)).limit(1);
      if (!updated) throw new Error("EFFECT_INTENT_POST_DELIVERY_READBACK_MISSING");
      return { intent: parseIntentRow(updated), receipt, skipped: false };
    });
  }

  async explain(effectId: string): Promise<AurionEffectExplanation | null> {
    const intent = await this.readIntent(effectId);
    if (!intent) return null;
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(aurionEffectDeliveryReceipts)
      .where(eq(aurionEffectDeliveryReceipts.effectId, effectId))
      .orderBy(aurionEffectDeliveryReceipts.attempt);

    let receiptChainValid = true;
    const receipts = rows.map((row, index) => {
      const parsed = JSON.parse(row.receiptJson) as AurionEffectDeliveryReceipt;
      if (!verifyEffectDeliveryReceipt(parsed) || parsed.deliveryReceiptHash !== row.deliveryReceiptHash) {
        receiptChainValid = false;
      }
      const expectedPrevious = index === 0 ? null : rows[index - 1]!.deliveryReceiptHash;
      if (parsed.previousDeliveryReceiptHash !== expectedPrevious) receiptChainValid = false;
      return Object.freeze(parsed);
    });
    return Object.freeze({ intent, receipts: Object.freeze(receipts), receiptChainValid });
  }
}

export const globalAurionEffectJournal = new AurionEffectJournal();
