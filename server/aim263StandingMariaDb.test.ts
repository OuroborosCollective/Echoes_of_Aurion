import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { acceptGameplayQuest, applyGameplayAction, completeGameplayQuest, getRelationshipStanding, getFactionQuestlineReadmodel, startGameplayEncounter, getOrCreatePlayerProfile, resolveFactionQuestDecisionForUser, completeFactionQuestlineQuestForUser } from "./db";

const suite = process.env.AURION_NPC_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const userId = 9263001;
suite("AIM-263 native relationship transactions in isolated MariaDB", () => {
  let pool: Pool; let isolated = false;
  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim263_abort_relationship");
    await pool.query("DELETE FROM itemInstances WHERE ownerUserId=?", [userId]);
    for (const table of ["aurionScopedMasteryEvents","aurionFactionQuestlineRewardReceipts","aurionFactionQuestlineDecisionReceipts","aurionFactionQuestlineOathReceipts","aurionFactionQuestlineStates","skillProgressionEvents","weaponMasteryReceipts","lootDropReceipts","expeditionResultReceipts","progressionLedger","gameplayActionReceipts","gameplaySessions","gameplayQuestProgress","gameplayDungeonKeys","weaponLoadouts","weaponMasteries","playerProfiles"]) await pool.query(`DELETE FROM ${table} WHERE userId=?`,[userId]);
  }
  beforeAll(async () => { pool=createPool(process.env.DATABASE_URL!); const [rows]=await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name"); if(!rows[0].name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED"); isolated=true; });
  beforeEach(cleanup);
  afterAll(async()=>{if(pool){if(isolated)await cleanup();await pool.end();}});
  async function finishEncounter() {
    await getOrCreatePlayerProfile(userId); await acceptGameplayQuest({userId,questKey:"astral_call"});
    const {session}=await startGameplayEncounter({userId,encounterKey:"asterion"});
    for(let sequence=1;sequence<=10;sequence++) {const result=await applyGameplayAction({userId,sessionId:session.id,sequence,command:"F",source:"human"});if(result.completed)return session.id;}
    throw new Error("ENCOUNTER_NOT_COMPLETED");
  }
  it("grants NPC/social mastery only on real turn-in and rehydrates it once",async()=>{
    await finishEncounter();
    expect((await getRelationshipStanding(userId)).entries.every(e=>e.sourceCount===0)).toBe(true);
    await completeGameplayQuest({userId,questKey:"astral_call",giver:"Lyra"});
    const first=await getRelationshipStanding(userId);
    expect(first.entries.find(e=>e.id==="lyra")).toMatchObject({score:5,tier:"NEUTRAL",sourceCount:1,xpExact:"4"});
    expect(first.social.find(e=>e.id==="friendship")).toMatchObject({xpExact:"4",usesExact:"1"});
    await completeGameplayQuest({userId,questKey:"astral_call",giver:"Lyra"});
    expect(await getRelationshipStanding(userId)).toEqual(first);
    expect((await getRelationshipStanding(userId+1)).entries.every(e=>e.sourceCount===0)).toBe(true);
    const [rows]=await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionScopedMasteryEvents WHERE userId=?",[userId]);expect(Number(rows[0].count)).toBe(2);
  });
  it("rolls back the entire native turn-in when relationship persistence fails",async()=>{
    await finishEncounter();
    await pool.query(`CREATE TRIGGER aim263_abort_relationship BEFORE INSERT ON aurionScopedMasteryEvents FOR EACH ROW BEGIN IF NEW.userId=${userId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AIM263_RELATIONSHIP_ROLLBACK'; END IF; END`);
    await expect(completeGameplayQuest({userId,questKey:"astral_call",giver:"Lyra"})).rejects.toThrow();
    const [rows]=await pool.query<RowDataPacket[]>("SELECT p.totalXp,p.aurionPoints,q.state FROM playerProfiles p JOIN gameplayQuestProgress q ON q.userId=p.userId WHERE p.userId=?",[userId]);
    expect(rows[0]).toMatchObject({totalXp:0,aurionPoints:0,state:"ready_to_turn_in"});
    await pool.query("DROP TRIGGER aim263_abort_relationship");await completeGameplayQuest({userId,questKey:"astral_call",giver:"Lyra"});
    expect((await getRelationshipStanding(userId)).entries.find(e=>e.id==="lyra")?.sourceCount).toBe(1);
  });
  it("binds faction standing to a real authored reward and rejects modified event bytes",async()=>{
    await resolveFactionQuestDecisionForUser({userId,questId:"free_haven.oath",decisionKey:"pledge",approach:"trade",idempotencyKey:"aim263:standing:oath"});
    await resolveFactionQuestDecisionForUser({userId,questId:"free_haven.mainline",decisionKey:"mediate",approach:"trade",idempotencyKey:"aim263:standing:main"});
    const request={userId,questId:"free_haven.mainline",idempotencyKey:"aim263:standing:reward"};
    const grants = await Promise.all([completeFactionQuestlineQuestForUser(request),completeFactionQuestlineQuestForUser(request)]);
    expect(grants.filter(r=>r.applied)).toHaveLength(1);expect(grants[0].receipt.id).toBe(grants[1].receipt.id);
    const first=await getRelationshipStanding(userId);
    expect((await getFactionQuestlineReadmodel(userId)).lastResolutionIndex).toBe(3);
    expect(first.entries.find(e=>e.id==="free_haven")).toMatchObject({score:4,sourceCount:1,xpExact:"5"});
    await completeFactionQuestlineQuestForUser(request);expect(await getRelationshipStanding(userId)).toEqual(first);
    await resolveFactionQuestDecisionForUser({userId,questId:"free_haven.water-list",decisionKey:"publish",approach:"trade",idempotencyKey:"aim263:standing:next"});
    expect((await getFactionQuestlineReadmodel(userId)).lastResolutionIndex).toBe(4);
    await pool.query("UPDATE aurionFactionQuestlineRewardReceipts SET xp=xp+1 WHERE userId=?",[userId]);
    await expect(getFactionQuestlineReadmodel(userId)).rejects.toThrow("EVIDENCE_INVALID");
    await pool.query("UPDATE aurionFactionQuestlineRewardReceipts SET xp=xp-1 WHERE userId=?",[userId]);
    await pool.query("UPDATE aurionScopedMasteryEvents SET eventJson='{}' WHERE userId=?",[userId]);
    await expect(getRelationshipStanding(userId)).rejects.toThrow("CORRUPT");
  });
});
