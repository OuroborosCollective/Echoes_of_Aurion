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
const LYRA_E2E_USER_ID = 2_146_999_991;

async function cleanupLyraE2eState() {
  const db = await getDb();
  if (!db) return;

  await db.transaction(async tx => {
    await tx.delete(gameplayActionReceipts).where(eq(gameplayActionReceipts.userId, LYRA_E2E_USER_ID));
    await tx.delete(gameplaySessions).where(eq(gameplaySessions.userId, LYRA_E2E_USER_ID));
    await tx.delete(gameplayDungeonKeys).where(eq(gameplayDungeonKeys.userId, LYRA_E2E_USER_ID));
    await tx.delete(progressionLedger).where(eq(progressionLedger.userId, LYRA_E2E_USER_ID));
    await tx.delete(gameplayQuestProgress).where(eq(gameplayQuestProgress.userId, LYRA_E2E_USER_ID));
    await tx.delete(playerProfiles).where(eq(playerProfiles.userId, LYRA_E2E_USER_ID));
  });
}

describeWithDatabase("Lyra quest turn-in E2E", () => {
  beforeEach(cleanupLyraE2eState);
  afterEach(cleanupLyraE2eState);

  it("holds Lyra rewards until the real Asterion completion is turned in exactly once", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const initial = await getGameplayProgress(LYRA_E2E_USER_ID);
    const initialLyraQuest = initial.quests.find(quest => quest.key === "astral_call");
    expect(initialLyraQuest).toMatchObject({ giver: "Lyra", state: "available", readyToTurnIn: false });
    expect(initial.profile).toMatchObject({ totalXp: 0, aurionPoints: 0, seasonPoints: 0, victories: 0 });

    const accepted = await acceptGameplayQuest({ userId: LYRA_E2E_USER_ID, questKey: "astral_call" });
    expect(accepted.quests.find(quest => quest.key === "astral_call")).toMatchObject({ state: "active", readyToTurnIn: false });

    const encounter = await startGameplayEncounter({ userId: LYRA_E2E_USER_ID, encounterKey: "asterion" });
    expect(encounter.session).toMatchObject({ encounterKey: "asterion", bossHp: 112, nextSequence: 1, status: "active" });

    let resolution = await applyGameplayAction({ userId: LYRA_E2E_USER_ID, sessionId: encounter.session.id, sequence: 1, command: "9", source: "human" });
    expect(resolution).toMatchObject({ bossHp: 69, completed: false, reward: { xp: 0, points: 0 } });
    resolution = await applyGameplayAction({ userId: LYRA_E2E_USER_ID, sessionId: encounter.session.id, sequence: 2, command: "9", source: "human" });
    expect(resolution).toMatchObject({ bossHp: 26, completed: false, reward: { xp: 0, points: 0 } });
    resolution = await applyGameplayAction({ userId: LYRA_E2E_USER_ID, sessionId: encounter.session.id, sequence: 3, command: "9", source: "human" });
    expect(resolution).toMatchObject({ bossHp: 0, completed: true, completedQuest: "astral_call", reward: { xp: 0, points: 0 } });

    const awaitingLyra = await getGameplayProgress(LYRA_E2E_USER_ID);
    expect(awaitingLyra.quests.find(quest => quest.key === "astral_call")).toMatchObject({ readyToTurnIn: true });
    expect(awaitingLyra.readyToTurnIn).toEqual(["astral_call"]);
    expect(awaitingLyra.profile).toMatchObject({ totalXp: 0, aurionPoints: 0, seasonPoints: 0, victories: 0 });

    await expect(completeGameplayQuest({ userId: LYRA_E2E_USER_ID, questKey: "astral_call", giver: "Orun" })).rejects.toThrow("Dieser Questgeber kann den Auftrag nicht abschließen.");
    expect((await getGameplayProgress(LYRA_E2E_USER_ID)).quests.find(quest => quest.key === "astral_call")).toMatchObject({ readyToTurnIn: true });

    const completed = await completeGameplayQuest({ userId: LYRA_E2E_USER_ID, questKey: "astral_call", giver: "Lyra" });
    expect(completed.quests.find(quest => quest.key === "astral_call")).toMatchObject({ state: "completed", readyToTurnIn: false });
    expect(completed.profile).toMatchObject({ totalXp: 120, aurionPoints: 20, seasonPoints: 20, victories: 1 });
    expect(completed.keys).toEqual([]);

    const questRow = (await db.select().from(gameplayQuestProgress).where(eq(gameplayQuestProgress.userId, LYRA_E2E_USER_ID)))[0];
    expect(questRow).toMatchObject({ questKey: "astral_call", state: "completed", completionSessionId: encounter.session.id });
    expect(questRow.readyAt).toBeInstanceOf(Date);
    expect(questRow.completedAt).toBeInstanceOf(Date);

    const rewards = await db.select().from(progressionLedger).where(eq(progressionLedger.userId, LYRA_E2E_USER_ID));
    expect(rewards.map(reward => `${reward.kind}:${reward.delta}`).sort()).toEqual(["points:20", "victory:1", "xp:120"]);
    expect(new Set(rewards.map(reward => reward.idempotencyKey)).size).toBe(3);

    await expect(completeGameplayQuest({ userId: LYRA_E2E_USER_ID, questKey: "astral_call", giver: "Lyra" })).rejects.toThrow("Dieser Auftrag ist noch nicht zur Übergabe bereit.");
    expect(await db.select().from(progressionLedger).where(eq(progressionLedger.userId, LYRA_E2E_USER_ID))).toHaveLength(3);
  }, 30_000);
});
