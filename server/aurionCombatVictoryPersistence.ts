import { eq } from "drizzle-orm";
import { aurionCombatVictoryEvents } from "../drizzle/schema";
import {
  AurionCombatVictoryEvidenceSchema,
  type AurionCombatVictoryEvidence,
} from "../shared/aurionQuestContract";
import { getDb } from "./db";

export async function persistAurionCombatVictoryEvidence(raw: AurionCombatVictoryEvidence): Promise<void> {
  const evidence = AurionCombatVictoryEvidenceSchema.parse(raw);
  const db = await getDb();
  if (!db) throw new Error("AURION_COMBAT_EVIDENCE_DATABASE_UNAVAILABLE");
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
  await db.insert(aurionCombatVictoryEvents).values({
    eventId: evidence.eventId,
    receiptId: evidence.receiptId,
    logicalRevision: evidence.logicalRevision,
    playerUserId: evidence.playerUserId,
    opponentEntityId: evidence.opponentEntityId,
    opponentSpecies: evidence.opponentSpecies,
    outcome: evidence.outcome,
    confirmed: evidence.confirmed,
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
