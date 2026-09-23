import { createPool } from "mysql2/promise";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resolveAndRecordGlobalWorldEpoch, recordWorldChunkDelta } from "./db";
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
      userId:1,worldId:"echoes-of-aurion-global",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:"sha256:"+"1".repeat(64),latestConfirmedVisitSequence:10,
      latestProjectionHash:"sha256:"+"2".repeat(64),sourceRevision:"a".repeat(40),
    });
    await db.insert(aurionExplorationMemoryProjections).values({
      id:"exp_test",userId:1,worldId:"echoes-of-aurion-global",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:first.firstDiscoveryReceiptHash,latestConfirmedVisitSequence:first.latestConfirmedVisitSequence,
      latestProjectionHash:first.latestProjectionHash,sourceRevision:first.sourceRevision,memoryHash:first.memoryHash
    });
    const updated=await createExplorationMemoryRecord({
      userId:1,worldId:"echoes-of-aurion-global",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:first.firstDiscoveryReceiptHash,latestConfirmedVisitSequence:20,
      latestProjectionHash:"sha256:"+"3".repeat(64),sourceRevision:"b".repeat(40),
    });
    await db.update(aurionExplorationMemoryProjections).set({
      latestConfirmedVisitSequence:updated.latestConfirmedVisitSequence,
      latestProjectionHash:updated.latestProjectionHash,
      sourceRevision:updated.sourceRevision,memoryHash:updated.memoryHash,
    }).where(eq(aurionExplorationMemoryProjections.id,"exp_test"));
    const read=await readExplorationMemory(1,"echoes-of-aurion-global",1);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]?.firstDiscoveryReceiptHash).toBe(first.firstDiscoveryReceiptHash);
    expect(read.records[0]?.latestConfirmedVisitSequence).toBe(20);
    expect(read.records[0]?.latestProjectionHash).toBe("sha256:"+"3".repeat(64));
  });

  it("persists discovery only after a real confirmed chunk readback", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");
    const worldId = "echoes-of-aurion-global";
    const chunk = { x: 777702, z: -777702 };
    const userId = 2146999970;

    await recordWorldChunkDelta({
      actorUserId: userId,
      coordinate: chunk,
      baseRevision: 1,
      kind: "structure_placed",
      targetId: "exploration-memory-proof-house",
      idempotencyKey: "exploration-memory-e2e:place:0001",
      payload: { xMm: 1000, zMm: 1000, assetKey: "aurion_tripo_starpath_marker" },
    });

    const epochResult = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: userId,
      idempotencyKey: "exploration-memory-e2e:epoch:0001",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const epoch = epochResult.plan.epoch;

    const first = await recordExplorationDiscovery(userId, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 10,
    });
    expect(first.status).toBe("VERIFIED");
    if (first.status !== "VERIFIED") throw new Error("EXPLORATION_MEMORY_NOT_VERIFIED");
    expect(first.memory.firstDiscoveryReceiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.memory.latestProjectionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.memory.sourceRevision).toMatch(/^[a-f0-9]{40}$/);

    const replay = await recordExplorationDiscovery(userId, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 9,
    });
    expect(replay.status).toBe("VERIFIED");
    expect(replay.memory.firstDiscoveryReceiptHash).toBe(first.memory.firstDiscoveryReceiptHash);
    expect(replay.memory.latestConfirmedVisitSequence).toBe(10);

    const read = await readExplorationMemory(userId, worldId, epoch);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]).toEqual(first.memory);
  });
});
