import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { acceptGameplayQuest, applyGameplayAction, completeGameplayQuest, getCurrentGameplayEncounter, getDb, startGameplayEncounter, recordValidatedExpeditionResult, recordValidatedSkillProgressionEvent, setWeaponLoadout } from "./db";
import { playerProfiles } from "../drizzle/schema";

const suite = process.env.AURION_ENCOUNTER_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const userId = 9253001;
suite("AIM-253 native encounter transaction in isolated MariaDB", () => {
  let pool: Pool; let isolated = false;
  let changedCatalog: { classKey: string; active: number }[] = [];
  const restoreCatalog = async () => {
    for (const row of changedCatalog) await pool.query("UPDATE treasureClasses SET active=? WHERE classKey=?", [row.active, row.classKey]);
    changedCatalog = [];
  };
  const cleanup = async () => {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim253_abort_completion");
    await pool.query("DROP TRIGGER IF EXISTS aim259_abort_dungeon_item");
    await restoreCatalog();
    await pool.query("DELETE FROM itemInstances WHERE ownerUserId=? OR lootReceiptId IN (SELECT id FROM lootDropReceipts WHERE userId=?)", [userId, userId]);
    for (const table of ["aurionScopedMasteryEvents", "skillProgressionEvents", "weaponMasteryReceipts", "lootDropReceipts", "expeditionResultReceipts", "progressionLedger", "gameplayActionReceipts", "gameplaySessions", "gameplayQuestProgress", "gameplayDungeonKeys", "weaponLoadouts", "weaponMasteries", "playerProfiles"]) await pool.query(`DELETE FROM ${table} WHERE userId=?`, [userId]);
  };
  const finalDungeonCommand = async () => {
    // Reach the dungeon through the real quest/key entry path, not a fabricated completion.
    for (const [questKey, encounterKey, giver] of [["astral_call", "asterion", "Lyra"], ["archive_of_echoes", "archive", "Orun"], ["ember_key", "solarium", "Lyra"]] as const) {
      if (questKey !== "astral_call") await acceptGameplayQuest({ userId, questKey });
      const { session } = await startGameplayEncounter({ userId, encounterKey });
      for (let sequence = 1; sequence <= 20; sequence++) {
        if ((await applyGameplayAction({ userId, sessionId: session.id, sequence, command: "9", source: "human" })).completed) break;
      }
      await completeGameplayQuest({ userId, questKey, giver });
    }
    const { session } = await startGameplayEncounter({ userId, encounterKey: "cinder_vault" });
    await applyGameplayAction({ userId, sessionId: session.id, sequence: 1, command: "F", source: "human" });
    // Stop immediately before the final hit so fault injection targets only finalization.
    await pool.query("UPDATE gameplaySessions SET bossHp=1 WHERE id=?", [session.id]);
    return { userId, sessionId: session.id, sequence: 2, command: "F", source: "human" as const };
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
    const [first, concurrent] = await Promise.all([0,1].map(() => completeGameplayQuest({ userId, questKey: "astral_call", giver: "Lyra" })));
    expect(concurrent.questDrop?.id).toBe(first.questDrop?.id);
    const recovered = await completeGameplayQuest({ userId, questKey: "astral_call", giver: "Lyra" });
    expect(recovered.questDrop?.id).toBe(first.questDrop?.id);
    const [reward] = await pool.query<RowDataPacket[]>("SELECT totalXp, aurionPoints, victories FROM playerProfiles WHERE userId=?", [userId]);
    expect(reward[0]).toMatchObject({ totalXp: 122, aurionPoints: 20, victories: 1 });
    const [ledger] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM progressionLedger WHERE userId=?", [userId]);
    expect(Number(ledger[0].count)).toBe(3);
  });
  it("serializes skill/weapon finalization and rejects a foreign or changed result replay", async () => {
    await setWeaponLoadout({userId,weaponTrack:"spear"});
    const {session}=await startGameplayEncounter({userId,encounterKey:"asterion"});
    for(let sequence=1;sequence<=10;sequence++) {
      if((await applyGameplayAction({userId,sessionId:session.id,sequence,command:"9",source:"human"})).completed) break;
    }
    await Promise.all([0,1].map(()=>completeGameplayQuest({userId,questKey:"astral_call",giver:"Lyra"})));
    const [results]=await pool.query<RowDataPacket[]>("SELECT * FROM expeditionResultReceipts WHERE userId=?",[userId]);
    expect(results).toHaveLength(1); const row=results[0];
    const replay={userId,expeditionKey:row.expeditionKey,seedDigest:row.seedDigest,resultDigest:row.resultDigest,confirmedByUserId:userId,idempotencyKey:row.idempotencyKey};
    await expect(recordValidatedExpeditionResult({...replay,userId:userId+1})).rejects.toThrow("RESULT_IDEMPOTENCY_CONFLICT");
    await pool.query("DELETE FROM playerProfiles WHERE userId=?",[userId+1]);
    await expect(recordValidatedExpeditionResult({...replay,resultDigest:"f".repeat(64)})).rejects.toThrow("RESULT_IDEMPOTENCY_CONFLICT");
    const [events]=await pool.query<RowDataPacket[]>("SELECT * FROM skillProgressionEvents WHERE userId=?",[userId]);
    expect(events).toHaveLength(1);
    await expect(recordValidatedSkillProgressionEvent({userId,skillId:"combat",amountExact:"999",source:"quest_reward",resultReceiptId:row.id,resolutionIndex:events[0].resolutionIndex,idempotencyKey:events[0].idempotencyKey})).rejects.toThrow("SKILL_IDEMPOTENCY_CONFLICT");
    const [mastery]=await pool.query<RowDataPacket[]>("SELECT xp FROM weaponMasteries WHERE userId=? AND weaponTrack='spear'",[userId]);
    expect(mastery).toEqual([expect.objectContaining({xp:10})]);
    const [receipts]=await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM weaponMasteryReceipts WHERE userId=?",[userId]); expect(Number(receipts[0].count)).toBe(1);
    const [items]=await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM itemInstances WHERE ownerUserId=?",[userId]); expect(Number(items[0].count)).toBe(1);
  });

  it("rolls back the dungeon's final hit, reward, result and drop when item creation fails", async () => {
    const command = await finalDungeonCommand();
    await pool.query(`CREATE TRIGGER aim259_abort_dungeon_item AFTER INSERT ON itemInstances FOR EACH ROW BEGIN IF NEW.ownerUserId=${userId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AIM259_FORCED_ROLLBACK'; END IF; END`);
    await expect(applyGameplayAction(command)).rejects.toThrow();
    expect((await getCurrentGameplayEncounter(userId)).active).toMatchObject({ id: command.sessionId, bossHp: 1, nextSequence: 2 });
    const [actions] = await pool.query<RowDataPacket[]>("SELECT sequence FROM gameplayActionReceipts WHERE sessionId=?", [command.sessionId]);
    expect(actions.map(row => row.sequence)).toEqual([1]);
    const [profile] = await pool.query<RowDataPacket[]>("SELECT totalXp, aurionPoints, victories FROM playerProfiles WHERE userId=?", [userId]);
    expect(profile[0]).toMatchObject({ totalXp: 702, aurionPoints: 115, victories: 3 });
    for (const table of ["expeditionResultReceipts", "lootDropReceipts"]) {
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS count FROM ${table} WHERE expeditionKey=?`, [`dungeon:${command.sessionId}`]);
      expect(Number(rows[0].count)).toBe(0);
    }
    const [ledger] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM progressionLedger WHERE userId=? AND source='dungeon:cinder_vault'", [userId]);
    expect(Number(ledger[0].count)).toBe(0);
    await pool.query("DROP TRIGGER aim259_abort_dungeon_item");
    expect(await applyGameplayAction(command)).toMatchObject({ completedDungeon: true, replayed: false, reward: { xp: 480, points: 90 }, drop: { id: expect.any(String) } });
  });

  it("replays one original dungeon completion despite concurrent calls and later profile, catalog or ownership changes", async () => {
    const command = await finalDungeonCommand();
    const results = await Promise.all([applyGameplayAction(command), applyGameplayAction(command)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(results[1]).toEqual({ ...results[0], replayed: results[1].replayed });
    const first = results[0];
    expect(first.drop?.id).toBeTruthy();
    const [profile] = await pool.query<RowDataPacket[]>("SELECT totalXp, aurionPoints, victories FROM playerProfiles WHERE userId=?", [userId]);
    expect(profile[0]).toMatchObject({ totalXp: 1182, aurionPoints: 205, victories: 4 });
    const [catalog] = await pool.query<RowDataPacket[]>("SELECT classKey, active FROM treasureClasses WHERE classKey=(SELECT treasureClass FROM lootDropReceipts WHERE expeditionKey=?)", [`dungeon:${command.sessionId}`]);
    changedCatalog = catalog.map(row => ({ classKey: row.classKey, active: row.active }));
    expect(changedCatalog).toHaveLength(1);
    await pool.query("UPDATE treasureClasses SET active=0 WHERE classKey=?", [changedCatalog[0].classKey]);
    await pool.query("UPDATE playerProfiles SET level=50, totalXp=1000000 WHERE userId=?", [userId]);
    await setWeaponLoadout({ userId, weaponTrack: "focus" });
    await pool.query("UPDATE itemInstances SET ownerUserId=?, status='sold' WHERE id=?", [userId + 1, first.drop!.id]);
    expect(await applyGameplayAction({ ...command, command: " f " })).toEqual({ ...first, replayed: true });
    const [item] = await pool.query<RowDataPacket[]>("SELECT ownerUserId, status FROM itemInstances WHERE id=?", [first.drop!.id]);
    expect(item[0]).toMatchObject({ ownerUserId: userId + 1, status: "sold" });
    const [after] = await pool.query<RowDataPacket[]>("SELECT totalXp, aurionPoints, victories FROM playerProfiles WHERE userId=?", [userId]);
    expect(after[0]).toMatchObject({ totalXp: 1000000, aurionPoints: 205, victories: 4 });
    const [ledger] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM progressionLedger WHERE userId=? AND source='dungeon:cinder_vault'", [userId]);
    expect(Number(ledger[0].count)).toBe(3);
    const [drops] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM lootDropReceipts WHERE expeditionKey=?", [`dungeon:${command.sessionId}`]);
    expect(Number(drops[0].count)).toBe(1);
    for (const override of [{ sequence: 1 }, { sequence: 3 }, { command: "E" }, { source: "gateway" as const }]) {
      await expect(applyGameplayAction({ ...command, ...override })).rejects.toThrow("DUNGEON_COMPLETION_REPLAY_CONFLICT");
    }
    await (await getDb())!.insert(playerProfiles).values({ userId: userId + 1 });
    try { await expect(applyGameplayAction({ ...command, userId: userId + 1 })).rejects.toThrow("nicht aktiv"); }
    finally { await pool.query("DELETE FROM playerProfiles WHERE userId=?", [userId + 1]); }
  });

  it("keeps a dungeon active until an eligible loot catalog exists", async () => {
    const command = await finalDungeonCommand();
    const [catalog] = await pool.query<RowDataPacket[]>("SELECT classKey, active FROM treasureClasses WHERE active=1");
    changedCatalog = catalog.map(row => ({ classKey: row.classKey, active: row.active }));
    await pool.query("UPDATE treasureClasses SET active=0 WHERE active=1");
    await expect(applyGameplayAction(command)).rejects.toThrow("DUNGEON_TREASURE_CLASS_UNAVAILABLE");
    expect((await getCurrentGameplayEncounter(userId)).active).toMatchObject({ bossHp: 1, nextSequence: 2 });
    await restoreCatalog();
    expect(await applyGameplayAction(command)).toMatchObject({ completedDungeon: true, replayed: false, drop: { id: expect.any(String) } });
  });

  it("rejects incomplete historical dungeon evidence without reissuing any rewards", async () => {
    const command = await finalDungeonCommand();
    const first = await applyGameplayAction(command);
    await pool.query("UPDATE expeditionResultReceipts SET status='rejected' WHERE expeditionKey=?", [`dungeon:${command.sessionId}`]);
    await expect(applyGameplayAction(command)).rejects.toThrow("DUNGEON_COMPLETION_EVIDENCE_INCOMPLETE");
    const [profile] = await pool.query<RowDataPacket[]>("SELECT totalXp, aurionPoints, victories FROM playerProfiles WHERE userId=?", [userId]);
    expect(profile[0]).toMatchObject({ totalXp: 1182, aurionPoints: 205, victories: 4 });
    const [items] = await pool.query<RowDataPacket[]>("SELECT id FROM itemInstances WHERE id=?", [first.drop!.id]);
    expect(items).toHaveLength(1);
  });

});
