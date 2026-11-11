import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { AurionTickRecorder } from "./tickRecorder";
import { MariaDBCausalPersistenceAdapter } from "./persistence";
import { applyShippedPlacementReadback, resetShippedPlacementOverridesForTest } from "../worldShippedPlacementOverrides";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { AURION_CAUSAL_TICK_SCHEMA_V2 } from "../../shared/aurionCausalTickContract";
import { replayZoneTick } from "./replayZoneTick";

// This is a real isolated MariaDB roundtrip. The large input is a labelled capacity
// probe, never production world data; no production connection is accepted.
const suite = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;
suite("20,000-override causal receipt capacity", () => {
 let pool: Pool;
 const zoneId="observatory_threshold:capacity-test";
 const adapter=new MariaDBCausalPersistenceAdapter();
 const cleanup=async()=>{for(const table of ["aurionCausalTickReceipts","aurionCausalArchive","aurionCausalCheckpoints"])await pool.query(`DELETE FROM ${table} WHERE worldId=? AND zoneId=?`,[GLOBAL_WORLD_ID,zoneId]);};
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test"))throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
  pool=createPool(process.env.DATABASE_URL!);await cleanup();
 });
 afterAll(async()=>{resetShippedPlacementOverridesForTest();if(pool){await cleanup();await pool.end();}});
 it("persists and independently reads a complete movement input above TEXT capacity",async()=>{
  const ids=Array.from({length:20000},(_,i)=>`aurion-world-assets.v1:${i}:-999999:11`);
  applyShippedPlacementReadback({worldId:GLOBAL_WORLD_ID,overrides:ids.map(id=>({placementRef:`shipped:${id}`,targetKind:"shipped_placement" as const,assetId:"aurion.world-visual.removed",revision:1}))});
  const zone=new AuthoritativeMovementZone(zoneId as never,new AurionTickRecorder());
  zone.receiptSchemaOverride=AURION_CAUSAL_TICK_SCHEMA_V2;
  const preState=zone.getCanonicalZoneState();zone.tick();const receipt=zone.getLatestReceipt()!;
  expect(receipt.schema).toBe(AURION_CAUSAL_TICK_SCHEMA_V2);
  if(receipt.schema!==AURION_CAUSAL_TICK_SCHEMA_V2)throw Error("V2_REQUIRED");
  expect(Buffer.byteLength(JSON.stringify(receipt.stages))).toBeGreaterThan(65535);
  await adapter.saveReceipt(receipt,[]);
  const [rows]=await pool.query<RowDataPacket[]>("SELECT OCTET_LENGTH(stageReceiptsJson) AS bytes FROM aurionCausalTickReceipts WHERE zoneId=? AND tick=1",[zoneId]);
  expect(rows[0].bytes).toBe(Buffer.byteLength(JSON.stringify(receipt.stages)));
  resetShippedPlacementOverridesForTest();
  const stored=await adapter.getRecordedTick(zoneId,1);
  expect(stored?.receipt).toEqual(receipt);
  expect(replayZoneTick({preState,intents:[],expectedReceipt:stored!.receipt}).verdict).toBe("MATCH");
  await adapter.archiveOldReceipts(zoneId,2);
  const [archives]=await pool.query<RowDataPacket[]>("SELECT payloadJson FROM aurionCausalArchive WHERE zoneId=?",[zoneId]);
  expect(archives).toHaveLength(1);
  expect(JSON.parse(archives[0].payloadJson)[0].receiptHash).toBe(receipt.receiptHash);
  // Retry verifies the large existing packet instead of truncating or duplicating it.
  await adapter.archiveOldReceipts(zoneId,2);
 });
});
