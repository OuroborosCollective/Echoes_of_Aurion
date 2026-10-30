import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptGameplayQuest,
  applyGameplayAction,
  completeGameplayQuest,
  getDb,
  getGameplayProgress,
  startGameplayEncounter,
} from "./db";
import {
  gameplayActionReceipts,
  gameplayDungeonKeys,
  gameplayQuestProgress,
  gameplaySessions,
  playerProfiles,
  progressionLedger,
} from "../drizzle/schema";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const QUEST_ABORT_REGRESSION_USER_ID = 2_146_999_993;

async function cleanupQuestAbortRegressionState() {
  const db = await getDb();
  if (!db) return;

  await db.transaction(async tx => {
    await tx.delete(gameplayActionReceipts).where(eq(gameplayActionReceipts.userId, QUEST_ABORT_REGRESSION_USER_ID));
    await tx.delete(gameplaySessions).where(eq(gameplaySessions.userId, QUEST_ABORT_REGRESSION_USER_ID));
    await tx.delete(gameplayDungeonKeys).where(eq(gameplayDungeonKeys.userId, QUEST_ABORT_REGRESSION_USER_ID));
    await tx.delete(progressionLedger).where(eq(progressionLedger.userId, QUEST_ABORT_REGRESSION_USER_ID));
    await tx.delete(gameplayQuestProgress).where(eq(gameplayQuestProgress.userId, QUEST_ABORT_REGRESSION_USER_ID));
    await tx.delete(playerProfiles).where(eq(playerProfiles.userId, QUEST_ABORT_REGRESSION_USER_ID));
  });
}

describeWithDatabase("quest abort regression E2E", () => {
  beforeEach(cleanupQuestAbortRegressionState);
  afterEach(cleanupQuestAbortRegressionState);

  it("resumes one active encounter without resetting damage, accepting stale actions or granting rewards", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    await acceptGameplayQuest({ userId: QUEST_ABORT_REGRESSION_USER_ID, questKey: "astral_call" });
    const first = await startGameplayEncounter({ userId: QUEST_ABORT_REGRESSION_USER_ID, encounterKey: "asterion" });
    const retry = await startGameplayEncounter({ userId: QUEST_ABORT_REGRESSION_USER_ID, encounterKey: "asterion" });
    expect(retry.session).toEqual(first.session);
    const action = {
      userId: QUEST_ABORT_REGRESSION_USER_ID,
      sessionId: first.session.id,
      sequence: 1,
      command: "9",
      source: "human" as const,
    };
    const applied = await applyGameplayAction(action);
    expect(applied.bossHp).toBeLessThan(first.session.bossHp);
    expect(applied.completed).toBe(false);
    const resumed = await startGameplayEncounter({ userId: QUEST_ABORT_REGRESSION_USER_ID, encounterKey: "asterion" });
    expect(resumed.session).toMatchObject({ id: first.session.id, bossHp: applied.bossHp, nextSequence: 2, status: "active" });
    await expect(applyGameplayAction(action)).rejects.toThrow("Die Aktionssequenz ist nicht gültig.");
    await expect(applyGameplayAction({ ...action, sessionId: "missing-session" })).rejects.toThrow("Die Spielsitzung ist nicht aktiv.");
    await expect(startGameplayEncounter({ userId: QUEST_ABORT_REGRESSION_USER_ID, encounterKey: "cinder_vault" })).rejects.toThrow("ACTIVE_ENCOUNTER_MUST_BE_COMPLETED");
    await expect(completeGameplayQuest({ userId: QUEST_ABORT_REGRESSION_USER_ID, questKey: "astral_call", giver: "Lyra" })).rejects.toThrow("Dieser Auftrag ist noch nicht zur Übergabe bereit.");

    const progress = await getGameplayProgress(QUEST_ABORT_REGRESSION_USER_ID);
    expect(progress.quests.find(quest => quest.key === "astral_call")).toMatchObject({ state: "active", readyToTurnIn: false });
    expect(progress.readyToTurnIn).toEqual([]);
    expect(progress.profile).toMatchObject({ totalXp: 0, aurionPoints: 0, seasonPoints: 0, victories: 0 });
    const sessions = await db.select().from(gameplaySessions).where(eq(gameplaySessions.userId, QUEST_ABORT_REGRESSION_USER_ID));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: first.session.id, status: "active", bossHp: applied.bossHp, nextSequence: 2 });
    expect(await db.select().from(gameplayActionReceipts).where(eq(gameplayActionReceipts.userId, QUEST_ABORT_REGRESSION_USER_ID))).toHaveLength(1);
    expect(await db.select().from(progressionLedger).where(eq(progressionLedger.userId, QUEST_ABORT_REGRESSION_USER_ID))).toHaveLength(0);
  }, 30_000);
});
