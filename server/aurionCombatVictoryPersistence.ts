import { and, asc, eq } from "drizzle-orm";
import { aurionCombatVictoryEvents, aurionQuestInstances } from "../drizzle/schema";
import {
  AurionCombatVictoryEvidenceSchema,
  type AurionCombatVictoryEvidence,
} from "../shared/aurionQuestContract";
import { getDb } from "./db";

type CombatEvidenceWriter = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select" | "insert">;

export async function persistAurionCombatVictoryEvidence(raw: AurionCombatVictoryEvidence): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("AURION_COMBAT_EVIDENCE_DATABASE_UNAVAILABLE");
  await db.transaction(tx => persistAurionCombatVictoryEvidenceInTransaction(tx, raw));
}

/** Called in the same transaction as its causal tick receipt. */
export async function persistAurionCombatVictoryEvidenceInTransaction(db: CombatEvidenceWriter, raw: AurionCombatVictoryEvidence): Promise<void> {
  const evidence = AurionCombatVictoryEvidenceSchema.parse(raw);
  const existing = (await db.select().from(aurionCombatVictoryEvents)
    .where(eq(aurionCombatVictoryEvents.receiptId, evidence.receiptId)).limit(1))[0];
  if (existing) {
    if (existing.eventId !== evidence.eventId
      || existing.logicalRevision !== evidence.logicalRevision
      || existing.playerUserId !== evidence.playerUserId
      || existing.opponentEntityId !== evidence.opponentEntityId
      || existing.opponentSpecies !== evidence.opponentSpecies
      || existing.outcome !== evidence.outcome
      || existing.confirmed !== evidence.confirmed) throw new Error("AURION_COMBAT_EVIDENCE_RECEIPT_CONFLICT");
    return;
  }
  const targets = await db.select({ id: aurionQuestInstances.id }).from(aurionQuestInstances).where(and(
    eq(aurionQuestInstances.playerUserId, evidence.playerUserId), eq(aurionQuestInstances.state, "active"),
  ));
  await db.insert(aurionCombatVictoryEvents).values({
    eventId: evidence.eventId,
    receiptId: evidence.receiptId,
    logicalRevision: evidence.logicalRevision,
    playerUserId: evidence.playerUserId,
    opponentEntityId: evidence.opponentEntityId,
    opponentSpecies: evidence.opponentSpecies,
    outcome: evidence.outcome,
    confirmed: evidence.confirmed,
    questInstanceIdsJson: JSON.stringify(targets.map(target => target.id).sort()),
    questProjected: false,
  });
}

export async function readAurionCombatVictoryEvidence(receiptId: string): Promise<AurionCombatVictoryEvidence | null> {
  if (!receiptId) return null;
  const db = await getDb();
  if (!db) throw new Error("AURION_COMBAT_EVIDENCE_DATABASE_UNAVAILABLE");
  const row = (await db.select().from(aurionCombatVictoryEvents)
    .where(eq(aurionCombatVictoryEvents.receiptId, receiptId)).limit(1))[0];
  if (!row) return null;
  return AurionCombatVictoryEvidenceSchema.parse({
    schema: "aurion.combat.victory.v1",
    eventId: row.eventId,
    receiptId: row.receiptId,
    logicalRevision: row.logicalRevision,
    playerUserId: row.playerUserId,
    opponentEntityId: row.opponentEntityId,
    opponentSpecies: row.opponentSpecies,
    outcome: row.outcome,
    confirmed: row.confirmed,
  });
}

/** Durable outbox: mark delivered only after every original target has committed.
 * A failed projection or process death is retried by the next persisted tick,
 * including the first tick after restart. Receipt keys make post-commit retry safe.
 */
export async function drainCombatQuestProjections(
  project: (userId: number, receiptId: string, instanceIds: readonly string[]) => Promise<unknown>,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("AURION_COMBAT_EVIDENCE_DATABASE_UNAVAILABLE");
  const pending = await db.select().from(aurionCombatVictoryEvents)
    .where(eq(aurionCombatVictoryEvents.questProjected, false))
    .orderBy(asc(aurionCombatVictoryEvents.logicalRevision), asc(aurionCombatVictoryEvents.receiptId)).limit(100).catch(error => {
      let cause: unknown = error;
      while (cause && typeof cause === "object") {
        const detail = cause as { code?: string; cause?: unknown };
        if (detail.code === "ER_NO_SUCH_TABLE" || detail.code === "ER_BAD_FIELD_ERROR") {
          throw new Error("AURION_COMBAT_PROJECTION_SCHEMA_UNAVAILABLE: migration 0069 is required", { cause: error });
        }
        cause = detail.cause;
      }
      throw error;
    });
  for (const row of pending) {
    const ids: unknown = JSON.parse(row.questInstanceIdsJson);
    if (!Array.isArray(ids) || !ids.every(id => typeof id === "string")) throw new Error("QUEST_COMBAT_OUTBOX_TARGETS_INVALID");
    await project(row.playerUserId, row.receiptId, ids);
    await db.update(aurionCombatVictoryEvents).set({ questProjected: true })
      .where(eq(aurionCombatVictoryEvents.receiptId, row.receiptId));
  }
}
