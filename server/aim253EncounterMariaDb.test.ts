import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { acceptGameplayQuest, applyGameplayAction, completeGameplayQuest, getCurrentGameplayEncounter, getDb, startGameplayEncounter } from "./db";
import { playerProfiles } from "../drizzle/schema";

const suite = process.env.AURION_ENCOUNTER_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const userId = 9253001;
suite("AIM-253 native encounter transaction in isolated MariaDB", () => {
  let pool: Pool; let isolated = false;
  const cleanup = async () => {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim253_abort_completion");
    await pool.query("DELETE FROM itemInstances WHERE ownerUserId=?", [userId]);
    for (const table of ["aurionScopedMasteryEvents", "skillProgressionEvents", "weaponMasteryReceipts", "lootDropReceipts", "expeditionResultReceipts", "progressionLedger", "gameplayActionReceipts", "gameplaySessions", "gameplayQuestProgress", "gameplayDungeonKeys", "weaponLoadouts", "weaponMasteries", "playerProfiles"]) await pool.query(`DELETE FROM ${table} WHERE userId=?`, [userId]);
  };
  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (!rows[0].name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(async () => {
    await cleanup(); await (await getDb())!.insert(playerProfiles).values({ userId });
    await acceptGameplayQuest({ userId, questKey: "astral_call" });
  });
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });
  it("parallel starts resume one durable session without resetting HP", async () => {
    const [first, retry] = await Promise.all([0, 1].map(() => startGameplayEncounter({ userId, encounterKey: "asterion" })));
    expect(first.session.id).toBe(retry.session.id);
    const action = await applyGameplayAction({ userId, sessionId: first.session.id, sequence: 1, command: "F", source: "human" });
    const resumed = await startGameplayEncounter({ userId, encounterKey: "asterion" });
    expect(resumed.session).toMatchObject({ id: first.session.id, bossHp: action.bossHp, nextSequence: 2 });
    await expect(startGameplayEncounter({ userId, encounterKey: "archive" })).rejects.toThrow("ACTIVE_ENCOUNTER_MUST_BE_COMPLETED");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?", [userId]);
    expect(Number(rows[0].count)).toBe(1);
  });
  it("serializes a repeated sequence and recovers the committed state without repeating damage", async () => {
    const { session } = await startGameplayEncounter({ userId, encounterKey: "asterion" });
    const command = { userId, sessionId: session.id, sequence: 1, command: "F", source: "human" as const };
    const results = await Promise.allSettled([applyGameplayAction(command), applyGameplayAction(command)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const [receipts] = await pool.query<RowDataPacket[]>("SELECT damage FROM gameplayActionReceipts WHERE sessionId=?", [session.id]);
    expect(receipts).toHaveLength(1);
    expect((await getCurrentGameplayEncounter(userId)).active).toMatchObject({ id: session.id, nextSequence: 2, bossHp: session.maxBossHp - receipts[0].damage });
    await expect(applyGameplayAction({ ...command, userId: userId + 1, sequence: 2 })).rejects.toThrow();
    expect((await getCurrentGameplayEncounter(userId)).active?.nextSequence).toBe(2);
  });
  it("rolls back the final action and HP if quest completion fails, then completes once", async () => {
    const { session } = await startGameplayEncounter({ userId, encounterKey: "asterion" });
    await pool.query("UPDATE gameplaySessions SET bossHp=1 WHERE id=?", [session.id]);
    await pool.query(`CREATE TRIGGER aim253_abort_completion BEFORE UPDATE ON gameplayQuestProgress FOR EACH ROW BEGIN IF NEW.userId=${userId} AND NEW.state='ready_to_turn_in' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AIM253_FORCED_ROLLBACK'; END IF; END`);
    const command = { userId, sessionId: session.id, sequence: 1, command: "F", source: "human" as const };
    await expect(applyGameplayAction(command)).rejects.toThrow();
    expect((await getCurrentGameplayEncounter(userId)).active).toMatchObject({ bossHp: 1, nextSequence: 1 });
    const [before] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE sessionId=?", [session.id]);
    expect(Number(before[0].count)).toBe(0);
    await pool.query("DROP TRIGGER aim253_abort_completion");
    expect(await applyGameplayAction(command)).toMatchObject({ completed: true, completedQuest: "astral_call", bossHp: 0 });
    expect((await getCurrentGameplayEncounter(userId)).active).toBeNull();
    await expect(applyGameplayAction(command)).rejects.toThrow("nicht aktiv");
    const [after] = await pool.query<RowDataPacket[]>("SELECT state, completionSessionId FROM gameplayQuestProgress WHERE userId=? AND questKey='astral_call'", [userId]);
    expect(after[0]).toMatchObject({ state: "ready_to_turn_in", completionSessionId: session.id });
    expect((await (await getDb())!.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)))[0].totalXp).toBe(0);
    const first = await completeGameplayQuest({ userId, questKey: "astral_call", giver: "Lyra" });
    const recovered = await completeGameplayQuest({ userId, questKey: "astral_call", giver: "Lyra" });
    expect(recovered.questDrop?.id).toBe(first.questDrop?.id);
    const [reward] = await pool.query<RowDataPacket[]>("SELECT totalXp, aurionPoints, victories FROM playerProfiles WHERE userId=?", [userId]);
    expect(reward[0]).toMatchObject({ totalXp: 122, aurionPoints: 20, victories: 1 });
    const [ledger] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM progressionLedger WHERE userId=?", [userId]);
    expect(Number(ledger[0].count)).toBe(3);
  });
});
