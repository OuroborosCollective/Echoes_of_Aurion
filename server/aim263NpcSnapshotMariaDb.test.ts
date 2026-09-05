import {createPool,type Pool,type RowDataPacket} from "mysql2/promise";
import {afterAll,beforeAll,beforeEach,describe,expect,it} from "vitest";
import {readConfirmedNpcPacket,resolveAndRecordNpc} from "./wasdAurionRuntime";
import {decodeOwnedNpcPacket} from "@shared/npcSnapshotProtocol";
const suite=process.env.AURION_NPC_E2E==="1"&&process.env.DATABASE_URL?describe:describe.skip;
suite("AIM-263 NPC packet from actual receipt storage",()=>{
 let pool:Pool,isolated=false;
 async function cleanup(){if(!isolated)throw Error("ISOLATED_TEST_DATABASE_REQUIRED");await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN ('lyra','orun')");await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN ('lyra','orun')");}
 beforeAll(async()=>{const url=new URL(process.env.DATABASE_URL!);if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test"))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");pool=createPool(process.env.DATABASE_URL!);const [rows]=await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");if(rows[0]?.name!==url.pathname.slice(1))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");isolated=true;});
 beforeEach(cleanup);afterAll(async()=>{if(pool){if(isolated)await cleanup();await pool.end();}});
 const resolve=(npcId:string,resolutionIndex:number)=>resolveAndRecordNpc({npcId,regionId:"observatory_threshold",resolutionIndex,needEvents:[],observationIds:["private-observation-text"],memory:["private-memory-text"]});
 it("reads exact persisted decisions without advancing them or exposing memory text",async()=>{
  expect(decodeOwnedNpcPacket(await readConfirmedNpcPacket(7),7).npcs).toEqual([]);
  const source=await resolve("lyra",3);await resolve("orun",4);
  const packet=await readConfirmedNpcPacket(7),decoded=decodeOwnedNpcPacket(packet,7);
  expect(await readConfirmedNpcPacket(7)).toEqual(packet);
  expect(decoded.npcs.map(n=>n.npcId)).toEqual(["lyra","orun"]);
  expect(decoded.npcs[0]).toMatchObject({needs:source.needs,decisionHash:source.decision.decisionHash,resolutionIndex:3,memoryCount:1});
  expect(Buffer.from(packet.data,"base64").toString("utf8")).not.toContain("private-");
  const [rows]=await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionNpcDecisionReceipts WHERE npcId IN ('lyra','orun')");expect(Number(rows[0].count)).toBe(2);
 });
 it("rejects the whole projection if a latest state or receipt is inconsistent",async()=>{
  await resolve("lyra",3);await resolve("orun",4);
  await pool.query("UPDATE aurionNpcStates SET needsJson='{}' WHERE npcId='orun'");
  await expect(readConfirmedNpcPacket(7)).rejects.toThrow();
  await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId='lyra'");
  await expect(readConfirmedNpcPacket(7)).rejects.toThrow();
 });
});
