import { and, asc, eq } from "drizzle-orm";
import { computeCanonicalHash } from "../shared/aurionQuestCanonicalHash";
import {
  computeEncounterCompletionEvidenceHash,
  encounterCompletionEvidenceSchema,
  type EncounterCompletionEvidence,
} from "../shared/aurionLegacyQuestBridgeContract";
import { gameplayActionReceipts, gameplaySessions } from "../drizzle/schema";
import { damageForMcpAction, mcpActionFromCommand } from "./gameplayProtocol";
import { getDb } from "./db";

type GameplaySessionRow = typeof gameplaySessions.$inferSelect;
type GameplayActionReceiptRow = typeof gameplayActionReceipts.$inferSelect;

const completionDomain = "aurion.encounter.completion.v1" as const;

export function deriveEncounterCompletionEvidence(input: {
  session: GameplaySessionRow;
  receipts: readonly GameplayActionReceiptRow[];
}): EncounterCompletionEvidence {
  const { session } = input;
  if (session.status !== "completed" || session.bossHp !== 0) {
    throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:SESSION_NOT_COMPLETED");
  }
  if (!Number.isSafeInteger(session.maxBossHp) || session.maxBossHp <= 0) {
    throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:INVALID_MAX_HP");
  }
  if (input.receipts.length < 1 || session.nextSequence !== input.receipts.length + 1) {
    throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:ACTION_CHAIN_LENGTH");
  }

  const ordered = [...input.receipts].sort((left, right) => left.sequence - right.sequence);
  let bossHp = session.maxBossHp;

  for (let index = 0; index < ordered.length; index += 1) {
    const receipt = ordered[index]!;
    const expectedSequence = index + 1;
    if (
      receipt.sessionId !== session.id ||
      receipt.userId !== session.userId ||
      receipt.sequence !== expectedSequence
    ) {
      throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:NON_CONTIGUOUS_ACTION_CHAIN");
    }

    const normalizedCommand = receipt.command.trim().toUpperCase();
    const action = mcpActionFromCommand(normalizedCommand);
    if (!action || action !== receipt.action) {
      throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:ACTION_IDENTITY_MISMATCH");
    }

    const expectedDamage = damageForMcpAction(action);
    if (receipt.damage !== expectedDamage || receipt.damage <= 0) {
      throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:DAMAGE_MISMATCH");
    }

    bossHp = Math.max(0, bossHp - receipt.damage);
  }

  if (bossHp !== 0) {
    throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:SIMULATED_HP_NOT_ZERO");
  }

  const finalReceipt = ordered.at(-1)!;
  const actionChainHash = computeCanonicalHash(completionDomain, {
    sessionId: session.id,
    userId: session.userId,
    encounterKey: session.encounterKey,
    maxBossHp: session.maxBossHp,
    completionSequence: finalReceipt.sequence,
    actions: ordered.map(receipt => ({
      id: receipt.id,
      sequence: receipt.sequence,
      command: receipt.command.trim().toUpperCase(),
      action: receipt.action,
      source: receipt.source,
      damage: receipt.damage,
    })),
  });

  const identity: Omit<EncounterCompletionEvidence, "evidenceHash"> = {
    schema: "aurion.encounter.completion.v1",
    eventId: `evt_encounter_complete_${session.id}`,
    sessionId: session.id,
    userId: session.userId,
    encounterKey: session.encounterKey as EncounterCompletionEvidence["encounterKey"],
    completionSequence: finalReceipt.sequence,
    finalActionReceiptId: finalReceipt.id,
    finalBossHp: 0,
    maxBossHp: session.maxBossHp,
    actionCount: ordered.length,
    actionChainHash,
  };

  return Object.freeze(encounterCompletionEvidenceSchema.parse({
    ...identity,
    evidenceHash: computeEncounterCompletionEvidenceHash(identity),
  }));
}

/**
 * Read-only adapter over the existing durable gameplay session/action receipt authority.
 * No event row is created here; completion evidence is deterministically reconstructed.
 */
export async function readEncounterCompletionEvidence(userId: number, sessionId: string): Promise<EncounterCompletionEvidence> {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:USER_INVALID");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:SESSION_ID_INVALID");
  const db = await getDb();
  if (!db) throw new Error("ENCOUNTER_COMPLETION_DATABASE_UNAVAILABLE");

  return db.transaction(async tx => {
    const session = (await tx.select().from(gameplaySessions).where(and(
      eq(gameplaySessions.id, sessionId),
      eq(gameplaySessions.userId, userId),
    )).limit(1))[0];
    if (!session) throw new Error("ENCOUNTER_COMPLETION_UNPROVABLE:SESSION_NOT_FOUND");

    const receipts = await tx.select().from(gameplayActionReceipts).where(and(
      eq(gameplayActionReceipts.sessionId, sessionId),
      eq(gameplayActionReceipts.userId, userId),
    )).orderBy(asc(gameplayActionReceipts.sequence));

    return deriveEncounterCompletionEvidence({ session, receipts });
  });
}
