import {createPool,type Pool} from "mysql2/promise";
import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {resolveAndRecordNpc} from "../wasdAurionRuntime";
import {aurionAuthoringRouter} from "../routes/aurionAuthoringRouter";
import type {TrpcContext} from "../_core/context";
const suite=process.env.AURION_WORLD_AUTHORING_DB_TEST==="1"&&process.env.DATABASE_URL?describe:describe.skip;
suite("Behavior Forge with real isolated MariaDB receipts",()=>{
  let pool:Pool;
  const caller=()=>aurionAuthoringRouter.createCaller({user:{id:42,role:"admin"}} as TrpcContext);
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);
    if(url.hostname!=="127.0.0.1" || !url.pathname.endsWith("_test"))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool=createPool(process.env.DATABASE_URL!);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId='lyra'");
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId='lyra'");
  });
  afterAll(async()=>{if(pool){await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId='lyra'");await pool.query("DELETE FROM aurionNpcStates WHERE npcId='lyra'");await pool.end();}});
  it("reads the actual receipt, compares without mutation and rejects a stale observation",async()=>{
    await resolveAndRecordNpc({npcId:"lyra",regionId:"observatory_threshold",resolutionIndex:3,needEvents:[],observationIds:["isolated-forge"],memory:[]});
    const before=await caller().behaviorActors(),actor=before.actors.find(a=>a.npcId==="lyra")!;
    expect(actor).toBeDefined();
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
