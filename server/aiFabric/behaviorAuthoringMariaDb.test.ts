import {createPool,type Pool} from "mysql2/promise";
import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {resolveAndRecordNpc} from "../wasdAurionRuntime";
import {aurionAuthoringRouter} from "../routes/aurionAuthoringRouter";
import type {TrpcContext} from "../_core/context";
import { useNpcSharedTableLock } from "../testSupport/npcSharedTableLock";

// Shares the append-only NPC memory/semantic-graph tables with other DB test files.
useNpcSharedTableLock();
const suite=process.env.AURION_WORLD_AUTHORING_DB_TEST==="1"&&process.env.DATABASE_URL?describe:describe.skip;
suite("Behavior Forge with real isolated MariaDB receipts",()=>{
  let pool:Pool;
  const caller=()=>aurionAuthoringRouter.createCaller({user:{id:42,role:"admin"}} as TrpcContext);
  // Memory and graph rows are append-only (DELETE is refused); clear them before the
  // state rows, or a later run finds memory without state (NPC_MEMORY_V4_STATE_GAP).
  const resetLyra=async()=>{
    for(const table of ["aurionSemanticGraphIndexV2","aurionSemanticGraphProvenanceV2","aurionSemanticGraphEdgesV2","aurionSemanticGraphNodesV2","aurionSemanticGraphReceiptsV2","aurionNpcMemoryReceiptsV4"]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId='lyra'");
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId='lyra'");
  };
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);
    if(url.hostname!=="127.0.0.1" || !url.pathname.endsWith("_test"))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool=createPool(process.env.DATABASE_URL!);
    await resetLyra();
  });
  afterAll(async()=>{if(pool){await resetLyra();await pool.end();}});
  it("reads the actual receipt, compares without mutation and rejects a stale observation",async()=>{
    await resolveAndRecordNpc({npcId:"lyra",regionId:"observatory_threshold",resolutionIndex:3,needEvents:[],observationIds:["isolated-forge"],memory:[]});
    const before=await caller().behaviorActors(),actor=before.actors.find(a=>a.npcId==="lyra")!;
    expect(actor).toBeDefined();
    // Same canonical mapping as the merchant-only journey readback.
    expect(actor.journeyMemorySupported).toBe(false);
    const {artifact}=await caller().behaviorDraft({role:"questgiver",mode:"utility",brief:"Offer interaction, never grant quest progress."});
    const result=await caller().behaviorTest({npcId:actor.npcId,expectedObservationHash:actor.observationHash,artifact});
    expect(result).toMatchObject({status:"TESTED",activation:"BLOCKED",comparison:{mutationAuthority:"none",execution:"offline"}});
    expect(await caller().behaviorActors()).toEqual(before);
    expect(result).not.toHaveProperty("receipt");
    await resolveAndRecordNpc({npcId:"lyra",regionId:"observatory_threshold",resolutionIndex:4,needEvents:[],observationIds:["isolated-next"],memory:[]});
    await expect(caller().behaviorTest({npcId:actor.npcId,expectedObservationHash:actor.observationHash,artifact})).rejects.toThrow("BEHAVIOR_OBSERVATION_CHANGED");
    await expect(caller().behaviorTest({npcId:"invented",expectedObservationHash:actor.observationHash,artifact})).rejects.toThrow("BEHAVIOR_NPC_NOT_CONFIRMED");
  });
});
