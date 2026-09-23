import { createPool } from "mysql2/promise";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { and,eq } from "drizzle-orm";
import { getDb } from "./db";
import { aurionExplorationMemoryProjections } from "../drizzle/schema";
import { createExplorationMemoryRecord } from "../shared/explorationMemoryProtocol";
import { recordExplorationDiscovery, readExplorationMemory } from "./explorationMemoryPersistence";

const suite=process.env.AURION_EXPLORATION_MEMORY_E2E==="1"&&process.env.DATABASE_URL?describe:describe.skip;

suite("Issue 323 Phase H exploration memory",()=>{
  let pool:any;
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);
    if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool=createPool(process.env.DATABASE_URL!);
    const [rows]=await pool.query("SELECT DATABASE() AS name");
    if(rows[0]?.name!==url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  });
  beforeEach(async()=>{
    await pool.query("TRUNCATE TABLE aurionExplorationMemoryProjections");
  });
  afterAll(async()=>{if(pool){await pool.query("TRUNCATE TABLE aurionExplorationMemoryProjections");await pool.end();}});
  it("derives stable memory hashes and never rewrites first discovery provenance",async()=>{
    const db=await getDb(); if(!db) throw new Error("Database not initialized");
    const first=await createExplorationMemoryRecord({
      userId:1,worldId:"aurion-global-world",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:"sha256:"+"1".repeat(64),latestConfirmedVisitSequence:10,
      latestProjectionHash:"sha256:"+"2".repeat(64),sourceRevision:"a".repeat(40),
    });
    await db.insert(aurionExplorationMemoryProjections).values({
      id:"exp_test",userId:1,worldId:"aurion-global-world",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:first.firstDiscoveryReceiptHash,latestConfirmedVisitSequence:first.latestConfirmedVisitSequence,
      latestProjectionHash:first.latestProjectionHash,sourceRevision:first.sourceRevision,memoryHash:first.memoryHash
    });
    const updated=await createExplorationMemoryRecord({
      userId:1,worldId:"aurion-global-world",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:first.firstDiscoveryReceiptHash,latestConfirmedVisitSequence:20,
      latestProjectionHash:"sha256:"+"3".repeat(64),sourceRevision:"b".repeat(40),
    });
    await db.update(aurionExplorationMemoryProjections).set({
      latestConfirmedVisitSequence:updated.latestConfirmedVisitSequence,
      latestProjectionHash:updated.latestProjectionHash,
      sourceRevision:updated.sourceRevision,memoryHash:updated.memoryHash,
    }).where(eq(aurionExplorationMemoryProjections.id,"exp_test"));
    const read=await readExplorationMemory(1,"aurion-global-world",1);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]?.firstDiscoveryReceiptHash).toBe(first.firstDiscoveryReceiptHash);
    expect(read.records[0]?.latestConfirmedVisitSequence).toBe(20);
    expect(read.records[0]?.latestProjectionHash).toBe("sha256:"+"3".repeat(64));
  });
});
