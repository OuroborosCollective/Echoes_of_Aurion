import { asc, eq } from "drizzle-orm";
import { aurionQuestReceipts } from "../../drizzle/schema";
import type { QuestInstance } from "../../shared/aurionQuestContract";
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";
import { readAurionCombatVictoryEvidence } from "../aurionCombatVictoryPersistence";
import { getDb } from "../db";

/** Independent durable readback of the six receipts actually consumed by this quest. */
export async function readPilotCombatCompletionEvidence(instance: QuestInstance) {
  if (instance.templateId !== "starter-wolves-6" || instance.templateVersion !== 1
    || !["active", "completed"].includes(instance.state) || instance.currentNodeId !== "end"
    || instance.objectiveProgress.wolf_victories !== 6) throw new Error("QUEST_PILOT_OBJECTIVE_NOT_COMPLETED");
  const db = await getDb();
  if (!db) throw new Error("QUEST_COMBAT_EVIDENCE_DATABASE_UNAVAILABLE");
  const receipts = await db.select().from(aurionQuestReceipts)
    .where(eq(aurionQuestReceipts.instanceId, instance.id)).orderBy(asc(aurionQuestReceipts.eventSequence));
  const prefix = `combat-victory:${instance.id}:`;
  const consumed = receipts.filter(receipt => receipt.idempotencyKey.startsWith(prefix));
  if (consumed.length !== 6 || new Set(consumed.map(receipt => receipt.idempotencyKey)).size !== 6) {
    throw new Error("QUEST_PILOT_SIX_UNIQUE_VICTORIES_REQUIRED");
  }
  const victories = [];
  for (const receipt of consumed) {
    const evidence = await readAurionCombatVictoryEvidence(receipt.idempotencyKey.slice(prefix.length));
    if (!evidence || evidence.playerUserId !== instance.playerUserId || evidence.opponentSpecies !== "clockwork_stalker"
      || receipt.planHash !== instance.planHash || receipt.graphHash !== instance.graphHash) {
      throw new Error("QUEST_PILOT_VICTORY_IDENTITY_MISMATCH");
    }
    victories.push({ questReceiptId: receipt.id, questReceiptHash: receipt.receiptHash, evidence });
  }
  return {
    id: `evt_combat_quest_complete_${instance.id}`,
    digest: computeCanonicalHash("aurion.pilot.combat.completion.v1", { instanceId: instance.id, victories }),
  };
}
