import { createPool } from "mysql2/promise";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resolveAndRecordGlobalWorldEpoch, recordWorldChunkDelta } from "./db";
import { aurionExplorationMemoryProjections } from "../drizzle/schema";
import { createExplorationMemoryRecord } from "../shared/explorationMemoryProtocol";
import { recordExplorationDiscovery, readExplorationMemory } from "./explorationMemoryPersistence";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import { globalZoneRegistry } from "./zoneRuntime";

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
    const chunk = { x: 0, z: 0 };
    const userId = 2146999970;

    // Isolated synthetic socket; the actual authoritative zone, tick recorder,
    // MariaDB persistence, epoch root and readback are exercised together.
    const causalZone = globalZoneRegistry.get("observatory_threshold");
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as any;
    const connected = causalZone.join({
      userId,
      socket,
      combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
    }).connectionId;
    const causalIntents = [...causalZone.getPendingIntents()];
    causalZone.tick();
    const causalReceipt = causalZone.getLatestReceipt();
    if (!causalReceipt) throw new Error("CAUSAL_RECEIPT_EXPECTED");
    const causalAdapter = new MariaDBCausalPersistenceAdapter();
    await causalZone.flushEvidencePersistence();
    await causalAdapter.saveReceipt(causalReceipt, causalIntents);

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

    // A confirmed world chunk does not prove that another user observed it.
    await expect(recordExplorationDiscovery(userId + 7, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_ACTOR_NOT_CONNECTED");
    expect((await readExplorationMemory(userId + 7, worldId, epoch)).records).toHaveLength(0);

    await expect(recordExplorationDiscovery(userId, {
      epoch, chunkX: chunk.x + 1, chunkZ: chunk.z, observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_ACTOR_CHUNK_MISMATCH");

    const lateConnection = causalZone.join({ userId: userId + 1, socket }).connectionId;
    await expect(recordExplorationDiscovery(userId + 1, {
      epoch, chunkX: chunk.x, chunkZ: chunk.z, observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_ACTOR_NOT_IN_EPOCH");

    // A legacy hash only proves row integrity. It must not be promoted to an
    // actor observation or rewritten under the new contract.
    const legacy = await createExplorationMemoryRecord({
      userId, worldId, worldEpoch: epoch, chunkX: chunk.x, chunkZ: chunk.z,
      firstDiscoveryReceiptHash: "sha256:" + "1".repeat(64),
      latestConfirmedVisitSequence: 999999,
      latestProjectionHash: "sha256:" + "2".repeat(64),
      sourceRevision: causalReceipt.sourceRevision,
    });
    await db.insert(aurionExplorationMemoryProjections).values({ id: "exp_legacy", ...legacy });
    await expect(recordExplorationDiscovery(userId, {
      epoch, chunkX: chunk.x, chunkZ: chunk.z, observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_MEMORY_PROVENANCE_MISMATCH");
    expect((await readExplorationMemory(userId, worldId, epoch)).records).toEqual([legacy]);
    await db.delete(aurionExplorationMemoryProjections).where(eq(aurionExplorationMemoryProjections.id, "exp_legacy"));

    const first = await recordExplorationDiscovery(userId, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 999999,
    });
    expect(first.status).toBe("VERIFIED");
    if (first.status !== "VERIFIED") throw new Error("EXPLORATION_MEMORY_NOT_VERIFIED");
    expect(first.memory.firstDiscoveryReceiptHash).toBe(causalReceipt.receiptHash);
    expect(first.memory.latestConfirmedVisitSequence).toBe(causalReceipt.tick);
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
    expect(replay.memory.latestConfirmedVisitSequence).toBe(causalReceipt.tick);

    const read = await readExplorationMemory(userId, worldId, epoch);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]).toEqual(first.memory);

    // Once the world epoch advances, the old snapshot cannot be used as a new
    // current discovery. The prior stored record remains independently readable.
    const nextIntents = [...causalZone.getPendingIntents()];
    causalZone.tick();
    const nextReceipt = causalZone.getLatestReceipt();
    if (!nextReceipt) throw new Error("CAUSAL_RECEIPT_EXPECTED");
    await causalZone.flushEvidencePersistence();
    await causalAdapter.saveReceipt(nextReceipt, nextIntents);
    await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: userId, idempotencyKey: "exploration-memory-e2e:epoch:0002",
      now: new Date("2026-01-01T00:00:01.000Z"),
    });
    await expect(recordExplorationDiscovery(userId, {
      epoch, chunkX: chunk.x, chunkZ: chunk.z, observedAtLogicalFrame: 1,
    })).rejects.toThrow("EXPLORATION_WORLD_EPOCH_STALE");
    expect((await readExplorationMemory(userId, worldId, epoch)).records).toEqual([first.memory]);
    causalZone.leave(lateConnection);
    causalZone.leave(connected);
  });
});
