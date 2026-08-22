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
const QUEST_CHAIN_REGRESSION_USER_ID = 2_146_999_992;

async function cleanupQuestChainRegressionState() {
  const db = await getDb();
  if (!db) return;

  await db.transaction(async tx => {
    await tx.delete(gameplayActionReceipts).where(eq(gameplayActionReceipts.userId, QUEST_CHAIN_REGRESSION_USER_ID));
    await tx.delete(gameplaySessions).where(eq(gameplaySessions.userId, QUEST_CHAIN_REGRESSION_USER_ID));
    await tx.delete(gameplayDungeonKeys).where(eq(gameplayDungeonKeys.userId, QUEST_CHAIN_REGRESSION_USER_ID));
    await tx.delete(progressionLedger).where(eq(progressionLedger.userId, QUEST_CHAIN_REGRESSION_USER_ID));
    await tx.delete(gameplayQuestProgress).where(eq(gameplayQuestProgress.userId, QUEST_CHAIN_REGRESSION_USER_ID));
    await tx.delete(playerProfiles).where(eq(playerProfiles.userId, QUEST_CHAIN_REGRESSION_USER_ID));
  });
}

async function defeatQuestEncounter(encounterKey: "asterion" | "archive" | "solarium") {
  const encounter = await startGameplayEncounter({ userId: QUEST_CHAIN_REGRESSION_USER_ID, encounterKey });

  await expect(applyGameplayAction({
    userId: QUEST_CHAIN_REGRESSION_USER_ID,
    sessionId: encounter.session.id,
    sequence: 2,
    command: "9",
    source: "human",
  })).rejects.toThrow("Die Aktionssequenz ist nicht gültig.");

  for (let sequence = 1; sequence <= 12; sequence += 1) {
    const resolution = await applyGameplayAction({
      userId: QUEST_CHAIN_REGRESSION_USER_ID,
      sessionId: encounter.session.id,
      sequence,
      command: "9",
      source: "human",
    });
    if (resolution.completed) return { encounter, resolution };
  }

  throw new Error(`${encounterKey} wurde nicht innerhalb des kanonischen Aktionsbudgets abgeschlossen.`);
}

describeWithDatabase("quest chain regression E2E", () => {
  beforeEach(cleanupQuestChainRegressionState);
  afterEach(cleanupQuestChainRegressionState);

  it("preserves ordered quest gates, NPC-bound turn-ins, deferred rewards, Ember Key and dungeon access", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const initial = await getGameplayProgress(QUEST_CHAIN_REGRESSION_USER_ID);
    expect(initial.quests.map(quest => [quest.key, quest.state, quest.readyToTurnIn])).toEqual([
      ["astral_call", "available", false],
      ["archive_of_echoes", "locked", false],
      ["ember_key", "locked", false],
    ]);
    await expect(acceptGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "archive_of_echoes" })).rejects.toThrow("Diese Quest ist für den aktuellen Fortschritt nicht verfügbar.");
    await expect(startGameplayEncounter({ userId: QUEST_CHAIN_REGRESSION_USER_ID, encounterKey: "cinder_vault" })).rejects.toThrow("Der Glutschlüssel und der abgeschlossene Questpfad sind für das Aschengewölbe erforderlich.");

    await acceptGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "astral_call" });
    const firstBoss = await defeatQuestEncounter("asterion");
    expect(firstBoss.resolution).toMatchObject({ completed: true, completedQuest: "astral_call", reward: { xp: 0, points: 0 } });
    expect((await getGameplayProgress(QUEST_CHAIN_REGRESSION_USER_ID)).profile).toMatchObject({ totalXp: 0, aurionPoints: 0, seasonPoints: 0, victories: 0 });
    await expect(completeGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "astral_call", giver: "Orun" })).rejects.toThrow("Dieser Questgeber kann den Auftrag nicht abschließen.");
    const afterLyra = await completeGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "astral_call", giver: "Lyra" });
    expect(afterLyra.profile).toMatchObject({ totalXp: 122, aurionPoints: 20, seasonPoints: 20, victories: 1 });
    expect(afterLyra.quests.find(quest => quest.key === "archive_of_echoes")).toMatchObject({ state: "available", readyToTurnIn: false });
    await expect(completeGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "astral_call", giver: "Lyra" })).rejects.toThrow("Dieser Auftrag ist noch nicht zur Übergabe bereit.");

    await acceptGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "archive_of_echoes" });
    const secondBoss = await defeatQuestEncounter("archive");
    expect(secondBoss.resolution).toMatchObject({ completed: true, completedQuest: "archive_of_echoes", reward: { xp: 0, points: 0 } });
    const beforeOrun = await getGameplayProgress(QUEST_CHAIN_REGRESSION_USER_ID);
    expect(beforeOrun.quests.find(quest => quest.key === "archive_of_echoes")).toMatchObject({ readyToTurnIn: true });
    expect(beforeOrun.profile).toMatchObject({ totalXp: 122, aurionPoints: 20, seasonPoints: 20, victories: 1 });
    await expect(completeGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "archive_of_echoes", giver: "Lyra" })).rejects.toThrow("Dieser Questgeber kann den Auftrag nicht abschließen.");
    const afterOrun = await completeGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "archive_of_echoes", giver: "Orun" });
    expect(afterOrun.profile).toMatchObject({ totalXp: 342, aurionPoints: 55, seasonPoints: 55, victories: 2 });
    expect(afterOrun.quests.find(quest => quest.key === "ember_key")).toMatchObject({ state: "available", readyToTurnIn: false });

    await acceptGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "ember_key" });
    const thirdBoss = await defeatQuestEncounter("solarium");
    expect(thirdBoss.resolution).toMatchObject({ completed: true, completedQuest: "ember_key", reward: { xp: 0, points: 0 }, dungeonKeyGranted: null });
    const beforeKeyTurnIn = await getGameplayProgress(QUEST_CHAIN_REGRESSION_USER_ID);
    expect(beforeKeyTurnIn.quests.find(quest => quest.key === "ember_key")).toMatchObject({ readyToTurnIn: true });
    expect(beforeKeyTurnIn.keys).toEqual([]);
    expect(beforeKeyTurnIn.canEnterDungeon).toBe(false);
    const completed = await completeGameplayQuest({ userId: QUEST_CHAIN_REGRESSION_USER_ID, questKey: "ember_key", giver: "Lyra" });
    expect(completed.profile).toMatchObject({ totalXp: 702, aurionPoints: 115, seasonPoints: 115, victories: 3 });
    expect(completed.quests.map(quest => [quest.key, quest.state, quest.readyToTurnIn])).toEqual([
      ["astral_call", "completed", false],
      ["archive_of_echoes", "completed", false],
      ["ember_key", "completed", false],
    ]);
    expect(completed.keys).toEqual(["ember_key"]);
    expect(completed.canEnterDungeon).toBe(true);

    const dungeon = await startGameplayEncounter({ userId: QUEST_CHAIN_REGRESSION_USER_ID, encounterKey: "cinder_vault" });
    expect(dungeon.session).toMatchObject({ encounterKey: "cinder_vault", status: "active", bossHp: 258 });
    const rewards = await db.select().from(progressionLedger).where(eq(progressionLedger.userId, QUEST_CHAIN_REGRESSION_USER_ID));
    expect(rewards).toHaveLength(9);
    expect(new Set(rewards.map(reward => reward.idempotencyKey)).size).toBe(9);
    expect(rewards.map(reward => `${reward.kind}:${reward.delta}`).sort()).toEqual([
      "points:20", "points:35", "points:60",
      "victory:1", "victory:1", "victory:1",
      "xp:122", "xp:220", "xp:360",
    ]);
    expect(await db.select().from(gameplayDungeonKeys).where(eq(gameplayDungeonKeys.userId, QUEST_CHAIN_REGRESSION_USER_ID))).toHaveLength(1);
  }, 45_000);
});
