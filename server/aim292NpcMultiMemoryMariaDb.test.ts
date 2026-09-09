import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveAndRecordNpc } from "./wasdAurionRuntime";
import { readConfirmedNpcMultiMemory, readConfirmedNpcMultiMemoryPacket } from "./npcMultiMemoryPersistence";
import { advanceNpcMemory, createNpcLifeSnapshot, encodeNpcLifeReceipt, npcAuthority, npcHash, npcMemoryReceiptIds,
  NPC_LIFE_RECEIPT_VERSION, NPC_MULTI_MEMORY_LIMITS, normalizeNpcRequest, npcRequestHash, parseNpcMemory, resolveNpcNeeds } from "./wasdNpcCapsule";
import { decodeOwnedNpcMultiMemory } from "../shared/npcMultiMemoryReadmodel";

const suite=process.env.AURION_NPC_E2E==="1"&&process.env.DATABASE_URL?describe:describe.skip;
const npcId="aim292:memory-npc";
// Isolated WASD protocol inputs. The browser proof separately observes the actual autonomous zone tick.
const request=(resolutionIndex:number,name=npcId)=>({npcId:name,regionId:"observatory_threshold",resolutionIndex,
  needEvents:[],observationIds:[`isolated-event:${resolutionIndex}`],memory:[`private-isolated-memory:${resolutionIndex}`],roleId:"merchant",
  economy:{currentHubId:"observatory_threshold",wealthCopper:1000,hungerBps:2000,fatigueBps:1500,tradeProwessBps:10500,harvestYieldBps:10000}});

suite("AIM-292 actual transactional multi-memory in isolated MariaDB",()=>{
  let pool:Pool,isolated=false;
  async function cleanup(){
    if(!isolated)throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim292_abort_memory");
    // Test files run serially. DDL cleanup preserves both append-only triggers.
    await pool.query("TRUNCATE TABLE aurionNpcMemoryReceiptsV4");
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?)",[npcId,"lyra"]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?,?)",[npcId,"lyra"]);
  }
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);
    if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test"))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool=createPool(process.env.DATABASE_URL!);
    const [rows]=await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if(rows[0]?.name!==url.pathname.slice(1))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated=true;
  });
  beforeEach(cleanup);afterAll(async()=>{if(pool){if(isolated)await cleanup();await pool.end();}});

  it("atomically commits once, returns historical sidecars and rehydrates in a fresh process",async()=>{
    const results=await Promise.all([0,1,2].map(()=>resolveAndRecordNpc(request(0))));
    expect(results.filter(r=>r.source==="created")).toHaveLength(1);
    expect(new Set(results.map(r=>r.multiMemory?.memoryHash)).size).toBe(1);
    const first=results[0].multiMemory!;
    const later=await resolveAndRecordNpc(request(1));
    expect(later.multiMemory?.authority).toEqual(npcAuthority());
    expect((await resolveAndRecordNpc(request(0))).multiMemory).toEqual(first);
    expect(await readConfirmedNpcMultiMemory(npcId)).toEqual(later.multiMemory);
    const output=execFileSync(process.execPath,["--import","tsx","--input-type=module","-e",
      'import {readConfirmedNpcMultiMemory} from "./server/npcMultiMemoryPersistence.ts";const value=await readConfirmedNpcMultiMemory("aim292:memory-npc");process.stdout.write(JSON.stringify(value));process.exit(0);'],{cwd:process.cwd(),env:process.env,encoding:"utf8",timeout:30000});
    expect(JSON.parse(output)).toEqual(later.multiMemory);
    const [rows]=await pool.query<RowDataPacket[]>("SELECT resolutionIndex,sourceRevision,previousMemoryHash,memoryHash FROM aurionNpcMemoryReceiptsV4 WHERE npcId=? ORDER BY resolutionIndex",[npcId]);
    expect(rows).toHaveLength(2);expect(rows[1].previousMemoryHash).toBe(first.memoryHash);expect(rows.every(r=>r.sourceRevision===npcAuthority().sourceRevision)).toBe(true);
  });

  it("starts v4 at a high legacy index and leaves the old v3 payload byte-identical",async()=>{
    const input=normalizeNpcRequest(request(4370));
    const snapshot=createNpcLifeSnapshot({...input,needs:resolveNpcNeeds({events:[]}),memoryState:advanceNpcMemory(parseNpcMemory("[]",-1),input.memory,4370)});
    const raw=encodeNpcLifeReceipt(npcRequestHash(input,NPC_LIFE_RECEIPT_VERSION),snapshot);
    const id=`npc_${npcHash([NPC_LIFE_RECEIPT_VERSION,npcId,4370]).slice(0,56)}`;
    await pool.query("INSERT INTO aurionNpcStates (npcId,regionId,needsJson,memoryJson,languageProfileId,lastResolutionIndex) VALUES (?,?,?,?,?,?)",[npcId,snapshot.regionId,JSON.stringify(snapshot.needs),JSON.stringify(snapshot.memoryState),input.languageProfileId,4370]);
    await pool.query("INSERT INTO aurionNpcDecisionReceipts (id,npcId,regionId,resolutionIndex,observationIdsJson,goal,decisionHash) VALUES (?,?,?,?,?,?,?)",[id,npcId,snapshot.regionId,4370,raw,snapshot.decision.goal,snapshot.decision.decisionHash]);
    expect(await readConfirmedNpcMultiMemory(npcId)).toBeNull();
    expect((await resolveAndRecordNpc(request(4370))).multiMemory).toBeNull();
    const next=await resolveAndRecordNpc(request(4371));
    expect(next.multiMemory).toMatchObject({lastResolutionIndex:4371,episodic:[{logicalIndex:4371}]});
    const [old]=await pool.query<RowDataPacket[]>("SELECT observationIdsJson FROM aurionNpcDecisionReceipts WHERE id=?",[id]);expect(old[0].observationIdsJson).toBe(raw);
    const [sidecars]=await pool.query<RowDataPacket[]>("SELECT resolutionIndex,previousReceiptId FROM aurionNpcMemoryReceiptsV4 WHERE npcId=?",[npcId]);expect(sidecars.map(r=>({...r}))).toEqual([{resolutionIndex:4371,previousReceiptId:null}]);
  });

  it("rolls back both decision and NPC state when the v4 insert fails",async()=>{
    const first=await resolveAndRecordNpc(request(0));
    await pool.query("CREATE TRIGGER aim292_abort_memory BEFORE INSERT ON aurionNpcMemoryReceiptsV4 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AIM292_FORCED_ROLLBACK'");
    await expect(resolveAndRecordNpc(request(1))).rejects.toThrow();
    const [states]=await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex FROM aurionNpcStates WHERE npcId=?",[npcId]);expect(states[0].lastResolutionIndex).toBe(0);
    const [decisions]=await pool.query<RowDataPacket[]>("SELECT resolutionIndex FROM aurionNpcDecisionReceipts WHERE npcId=?",[npcId]);expect(decisions.map(r=>r.resolutionIndex)).toEqual([0]);
    expect(await readConfirmedNpcMultiMemory(npcId)).toEqual(first.multiMemory);
    await pool.query("DROP TRIGGER aim292_abort_memory");expect((await resolveAndRecordNpc(request(1))).source).toBe("created");
  });

  it("rejects stale or conflicting requests and actual sidecar updates/deletes",async()=>{
    const first=await resolveAndRecordNpc(request(4));
    await expect(resolveAndRecordNpc(request(3))).rejects.toThrow("OUT_OF_ORDER");
    await expect(resolveAndRecordNpc({...request(4),memory:["changed"]})).rejects.toThrow("INPUT_CONFLICT");
    for(const sql of ["UPDATE aurionNpcMemoryReceiptsV4 SET memoryHash=REPEAT('0',64) WHERE npcId=?","DELETE FROM aurionNpcMemoryReceiptsV4 WHERE npcId=?"]){
      await expect(pool.query(sql,[npcId])).rejects.toMatchObject({sqlState:"45000",sqlMessage:"AURION_NPC_MEMORY_V4_APPEND_ONLY"});
    }
    expect(await readConfirmedNpcMultiMemory(npcId)).toEqual(first.multiMemory);
  });

  it("requires actual source receipts on readback and preserves old provenance beyond the recent window",async()=>{
    for(let i=0;i<70;i++)await resolveAndRecordNpc(request(i));
    const memory=(await readConfirmedNpcMultiMemory(npcId))!;
    expect(memory.episodic).toHaveLength(24);expect(memory.semantic).toHaveLength(64);expect(memory.seenReceipts).toHaveLength(64);
    expect(Buffer.byteLength(JSON.stringify(memory))).toBeLessThanOrEqual(NPC_MULTI_MEMORY_LIMITS.bytes);
    const oldest=memory.procedural[0].provenance[0].receiptId;expect(npcMemoryReceiptIds(memory)).toContain(oldest);
    const [rows]=await pool.query<RowDataPacket[]>("SELECT observationIdsJson FROM aurionNpcDecisionReceipts WHERE id=?",[oldest]);
    await pool.query("UPDATE aurionNpcDecisionReceipts SET observationIdsJson='{}' WHERE id=?",[oldest]);
    await expect(readConfirmedNpcMultiMemory(npcId)).rejects.toThrow();
    await pool.query("UPDATE aurionNpcDecisionReceipts SET observationIdsJson=? WHERE id=?",[rows[0].observationIdsJson,oldest]);
    expect((await readConfirmedNpcMultiMemory(npcId))?.memoryHash).toBe(memory.memoryHash);
    const expired=(await resolveAndRecordNpc(request(3569))).multiMemory!;
    expect(expired.episodic).toHaveLength(1);expect(expired.semantic.some(f=>f.status==="expired")).toBe(true);
  },60000);

  it("returns an owner-bound readmodel without raw memory or receipt payloads",async()=>{
    const result=await resolveAndRecordNpc(request(7,"lyra"));
    const packet=await readConfirmedNpcMultiMemoryPacket(7),parsed=decodeOwnedNpcMultiMemory(packet,7);
    expect(parsed.npcs.find(n=>n.npcId==="lyra")).toMatchObject({memoryHash:result.multiMemory?.memoryHash,counts:{working:1,episodic:1,semantic:2,procedural:2}});
    expect(JSON.stringify(packet)).not.toMatch(/private-isolated|sourceDecisionReceiptId|receiptSha256|provenance/);
    expect(()=>decodeOwnedNpcMultiMemory(packet,8)).toThrow();
    expect(await readConfirmedNpcMultiMemoryPacket(7)).toEqual(packet);
  });
});
