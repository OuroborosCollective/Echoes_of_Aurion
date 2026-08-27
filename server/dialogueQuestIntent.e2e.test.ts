import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  getDb,
  getGameplayProgress,
  requestQuestActionFromDialogue,
} from "./db";
import { interpretAndRecordDialogue } from "./wasdAurionRuntime";
import {
  aurionDialogueCommandReceipts,
  aurionDialogueReceipts,
  gameplayQuestProgress,
  playerProfiles,
  progressionLedger,
  skillProgressionEvents,
} from "../drizzle/schema";

const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;
const DIALOGUE_INTENT_E2E_USER_ID = 2_146_999_995;
const FOREIGN_DIALOGUE_INTENT_E2E_USER_ID = 2_146_999_996;

async function cleanupDialogueIntentE2eState() {
  const db = await getDb();
  if (!db) return;
  await db.transaction(async tx => {
    await tx
      .delete(aurionDialogueCommandReceipts)
      .where(
        eq(aurionDialogueCommandReceipts.userId, DIALOGUE_INTENT_E2E_USER_ID)
      );
    await tx
      .delete(aurionDialogueCommandReceipts)
      .where(
        eq(
          aurionDialogueCommandReceipts.userId,
          FOREIGN_DIALOGUE_INTENT_E2E_USER_ID
        )
      );
    await tx
      .delete(aurionDialogueReceipts)
      .where(eq(aurionDialogueReceipts.userId, DIALOGUE_INTENT_E2E_USER_ID));
    await tx
      .delete(aurionDialogueReceipts)
      .where(
        eq(aurionDialogueReceipts.userId, FOREIGN_DIALOGUE_INTENT_E2E_USER_ID)
      );
    await tx
      .delete(skillProgressionEvents)
      .where(eq(skillProgressionEvents.userId, DIALOGUE_INTENT_E2E_USER_ID));
    await tx
      .delete(progressionLedger)
      .where(eq(progressionLedger.userId, DIALOGUE_INTENT_E2E_USER_ID));
    await tx
      .delete(gameplayQuestProgress)
      .where(eq(gameplayQuestProgress.userId, DIALOGUE_INTENT_E2E_USER_ID));
    await tx
      .delete(playerProfiles)
      .where(eq(playerProfiles.userId, DIALOGUE_INTENT_E2E_USER_ID));
  });
}

describeWithDatabase("Dialogue quest intent E2E", () => {
  beforeEach(cleanupDialogueIntentE2eState);
  afterEach(cleanupDialogueIntentE2eState);

  it("records exactly one owned offer receipt without accepting a quest or granting a reward", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const initial = await getGameplayProgress(DIALOGUE_INTENT_E2E_USER_ID);
    expect(
      initial.quests.find(quest => quest.key === "astral_call")
    ).toMatchObject({ state: "available", giver: "Lyra" });

    const dialogue = await interpretAndRecordDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      npcId: "lyra",
      text: "Seid gegrüßt, ich brauche einen Auftrag.",
      trust: 0.6,
      threat: 0.1,
      idempotencyKey: "dialogue-intent-e2e-accepted-0001",
    });
    expect(dialogue).toMatchObject({
      state: "accepted",
      semanticIntent: "ask_quest",
    });
    expect(dialogue.receiptId).toMatch(/^dialogue_/);

    const first = await requestQuestActionFromDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      dialogueReceiptId: dialogue.receiptId,
      actionKind: "offer_quest",
      questKey: "astral_call",
      idempotencyKey: "dialogue-command-e2e-offer-0001",
    });
    expect(first).toMatchObject({
      replayed: false,
      receipt: {
        dialogueReceiptId: dialogue.receiptId,
        npcId: "lyra",
        actionKind: "offer_quest",
        questKey: "astral_call",
        outcome: {
          state: "offer_available_quest",
          reason: "accepted_quest_request",
        },
      },
    });

    const replay = await requestQuestActionFromDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      dialogueReceiptId: dialogue.receiptId,
      actionKind: "offer_quest",
      questKey: "astral_call",
      idempotencyKey: "dialogue-command-e2e-offer-0001",
    });
    expect(replay).toMatchObject({
      replayed: true,
      receipt: { id: first.receipt.id },
    });

    const afterOffer = await getGameplayProgress(DIALOGUE_INTENT_E2E_USER_ID);
    expect(
      afterOffer.quests.find(quest => quest.key === "astral_call")
    ).toMatchObject({ state: "available", readyToTurnIn: false });
    expect(
      await db
        .select()
        .from(gameplayQuestProgress)
        .where(eq(gameplayQuestProgress.userId, DIALOGUE_INTENT_E2E_USER_ID))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(progressionLedger)
        .where(eq(progressionLedger.userId, DIALOGUE_INTENT_E2E_USER_ID))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(skillProgressionEvents)
        .where(eq(skillProgressionEvents.userId, DIALOGUE_INTENT_E2E_USER_ID))
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(aurionDialogueCommandReceipts)
        .where(
          eq(aurionDialogueCommandReceipts.userId, DIALOGUE_INTENT_E2E_USER_ID)
        )
    ).toHaveLength(1);
  });

  it("rejects a foreign, quarantined, mismatched or re-used dialogue command without a new receipt", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const accepted = await interpretAndRecordDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      npcId: "lyra",
      text: "Ich benötige einen Auftrag.",
      trust: 0.6,
      threat: 0.1,
      idempotencyKey: "dialogue-intent-e2e-accepted-0002",
    });
    await expect(
      requestQuestActionFromDialogue({
        userId: FOREIGN_DIALOGUE_INTENT_E2E_USER_ID,
        dialogueReceiptId: accepted.receiptId,
        actionKind: "offer_quest",
        questKey: "astral_call",
        idempotencyKey: "dialogue-command-e2e-foreign-0002",
      })
    ).rejects.toThrow(
      "Ein eigener bestätigter Dialogreceipt ist erforderlich."
    );

    await expect(
      requestQuestActionFromDialogue({
        userId: DIALOGUE_INTENT_E2E_USER_ID,
        dialogueReceiptId: accepted.receiptId,
        actionKind: "offer_quest",
        questKey: "archive_of_echoes",
        idempotencyKey: "dialogue-command-e2e-mismatch-0002",
      })
    ).rejects.toThrow(
      "Dieser Dialog erlaubt die angefragte Questaktion nicht."
    );

    const quarantined = await interpretAndRecordDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      npcId: "lyra",
      text: "Hier ist mein private key.",
      trust: 0.6,
      threat: 0.1,
      idempotencyKey: "dialogue-intent-e2e-quarantine-0002",
    });
    expect(quarantined).toMatchObject({
      state: "quarantined",
      semanticIntent: "unknown",
    });
    await expect(
      requestQuestActionFromDialogue({
        userId: DIALOGUE_INTENT_E2E_USER_ID,
        dialogueReceiptId: quarantined.receiptId,
        actionKind: "offer_quest",
        questKey: "astral_call",
        idempotencyKey: "dialogue-command-e2e-quarantine-0002",
      })
    ).rejects.toThrow(
      "Dieser Dialog erlaubt die angefragte Questaktion nicht."
    );

    const offered = await requestQuestActionFromDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      dialogueReceiptId: accepted.receiptId,
      actionKind: "offer_quest",
      questKey: "astral_call",
      idempotencyKey: "dialogue-command-e2e-reused-0002",
    });
    await expect(
      requestQuestActionFromDialogue({
        userId: DIALOGUE_INTENT_E2E_USER_ID,
        dialogueReceiptId: accepted.receiptId,
        actionKind: "request_turn_in",
        questKey: "astral_call",
        idempotencyKey: "dialogue-command-e2e-reused-0002",
      })
    ).rejects.toThrow(
      "Dieser Idempotenzschlüssel gehört zu einer anderen Dialogaktion."
    );
    expect(offered.replayed).toBe(false);
    expect(
      await db
        .select()
        .from(aurionDialogueCommandReceipts)
        .where(
          eq(aurionDialogueCommandReceipts.userId, DIALOGUE_INTENT_E2E_USER_ID)
        )
    ).toHaveLength(1);
  });

  it("collapses concurrent equivalent confirmations into one receipt", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const dialogue = await interpretAndRecordDialogue({
      userId: DIALOGUE_INTENT_E2E_USER_ID,
      npcId: "lyra",
      text: "Ich bitte um Hilfe bei einem Auftrag.",
      trust: 0.6,
      threat: 0.1,
      idempotencyKey: "dialogue-intent-e2e-concurrent-0003",
    });
    const results = await Promise.all([
      requestQuestActionFromDialogue({
        userId: DIALOGUE_INTENT_E2E_USER_ID,
        dialogueReceiptId: dialogue.receiptId,
        actionKind: "offer_quest",
        questKey: "astral_call",
        idempotencyKey: "dialogue-command-e2e-concurrent-a",
      }),
      requestQuestActionFromDialogue({
        userId: DIALOGUE_INTENT_E2E_USER_ID,
        dialogueReceiptId: dialogue.receiptId,
        actionKind: "offer_quest",
        questKey: "astral_call",
        idempotencyKey: "dialogue-command-e2e-concurrent-b",
      }),
    ]);

    expect(new Set(results.map(result => result.receipt.id)).size).toBe(1);
    expect(results.filter(result => result.replayed).length).toBe(1);
    expect(
      await db
        .select()
        .from(aurionDialogueCommandReceipts)
        .where(
          eq(aurionDialogueCommandReceipts.userId, DIALOGUE_INTENT_E2E_USER_ID)
        )
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(gameplayQuestProgress)
        .where(eq(gameplayQuestProgress.userId, DIALOGUE_INTENT_E2E_USER_ID))
    ).toHaveLength(0);
  }, 30_000);
});
