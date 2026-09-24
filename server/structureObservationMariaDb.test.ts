import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aurionActiveCivilizations, aurionCivilizationHistoryEvents, aurionGlobalWorldEpochReceipts, aurionGlobalWorldStates, aurionRuinOrigins, aurionSettlementRebirthCandidates, aurionWorldEpochReactions, aurionWorldEpochRequests, aurionWorldPresenceLeases, aurionWorldChunkDeltas } from "../drizzle/schema";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../drizzle/aurionCausalitySchema";
import { getDb, recordWorldChunkDelta, resolveAndRecordGlobalWorldEpoch } from "./db";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { globalTickRecorder } from "./causality/tickRecorder";
import { worldCausalRootService } from "./causality/worldCausalRootService";
import { StructureObservationRuntime } from "./structureObservationRuntime";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import type { DeterministicStructureGrammar } from "../shared/deterministicStructureGrammarProtocol";

const suite = process.env.AURION_STRUCTURE_OBSERVATION_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const WORLD_ID = GLOBAL_WORLD_ID;
const CHUNK = { x: 777701, z: -777701 };
const USER_ID = 2_146_999_972;
const grammar: DeterministicStructureGrammar = {
  grammarId: "maria-house",
  grammarVersion: "1.0.0",
  rootRuleId: "root",
  rules: [{
    id: "root",
    body: {
      kind: "primitive",
      primitive: {
        kind: "box",
        assetKey: "aurion_maria_generated_house",
        materialKey: "stone",
        sizeMm: { x: 2_000, y: 2_500, z: 3_000 },
      },
    },
  }],
};

function releaseSha(): string {
  const value = process.env.AURION_RELEASE_SHA;
  if (!value || !/^[a-f0-9]{40}$/.test(value)) throw new Error("AURION_RELEASE_SHA_REQUIRED");
  return value;
}

async function cleanup(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM aurionWorldChunkDeltas WHERE worldId=? AND chunkX=? AND chunkZ=?", [WORLD_ID, CHUNK.x, CHUNK.z]);
  await pool.query("DELETE FROM aurionWorldPresenceLeases WHERE userId=?", [USER_ID]);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED");
  await db.delete(aurionSettlementRebirthCandidates).where(eq(aurionSettlementRebirthCandidates.worldId, WORLD_ID));
  await db.delete(aurionRuinOrigins);
  await db.delete(aurionCivilizationHistoryEvents).where(eq(aurionCivilizationHistoryEvents.worldId, WORLD_ID));
  await db.delete(aurionActiveCivilizations).where(eq(aurionActiveCivilizations.worldId, WORLD_ID));
  await db.delete(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
  await db.delete(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.worldId, WORLD_ID));
  await db.delete(aurionGlobalWorldEpochReceipts).where(eq(aurionGlobalWorldEpochReceipts.worldId, WORLD_ID));
  await db.delete(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, WORLD_ID));
  await db.delete(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.worldId, WORLD_ID));
  await db.delete(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, WORLD_ID));
}

suite("AIM-514 real lazy structure observation", () => {
  let pool: Pool;
  let isolated = false;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });

  beforeEach(async () => {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await cleanup(pool);
  });

  afterAll(async () => {
    if (pool) {
      if (isolated) await cleanup(pool);
      await pool.end();
    }
  });

  it("replays a real confirmed chunk, observes a structure, evicts cache and reconstructs the identical evidence", async () => {
    const release = releaseSha();

    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.sourceRevisionOverride = release;
    zone.tick();
    await globalTickRecorder.flushPersistence();

    const placed = await recordWorldChunkDelta({
      actorUserId: USER_ID,
      coordinate: CHUNK,
      baseRevision: 1,
      kind: "structure_placed",
      targetId: "aim514-real-house",
      idempotencyKey: "aim514-real:place:0001",
      payload: { xMm: 1_200, zMm: 2_300, assetKey: "aurion_confirmed_house" },
    });

    const epochResult = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: USER_ID,
      idempotencyKey: "aim514-real:epoch:0001",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(epochResult.source).toBe("created");
    const epoch = epochResult.plan.epoch;

    const confirmed = await worldCausalRootService.readChunk(WORLD_ID, epoch, CHUNK);
    expect(confirmed.status).toBe("VERIFIED");
    if (confirmed.status !== "VERIFIED") throw new Error(confirmed.reason);
    expect(confirmed.receipt.throughSequence).toBe(1);
    expect(confirmed.state.materialized.structures).toEqual([{
      id: "aim514-real-house",
      assetKey: "aurion_confirmed_house",
      positionMm: { x: 1_200, z: 2_300 },
    }]);

    const runtime = new StructureObservationRuntime();
    const request = {
      worldId: WORLD_ID,
      epoch,
      chunkCoordinate: CHUNK,
      structureId: "aim514-real-house",
      anchorId: "aim514-anchor-house",
      grammar,
    };

    const first = await runtime.observe(request);
    expect(first.status).toBe("VERIFIED");
    if (first.status !== "VERIFIED") throw new Error(first.reason);
    expect(first.materialization.state).toBe("DELTA_OVERRIDE");
    expect(first.materialization.primitives).toHaveLength(0);
    expect(first.materialization.deltaOverride).toMatchObject({
      deltaId: placed.delta.id,
      targetId: "aim514-real-house",
      assetKey: "aurion_confirmed_house",
      positionMm: { x: 1_200, z: 2_300 },
    });
    expect(first.identity.confirmedChunkAuthorityStateHash).toBe(confirmed.state.authorityStateHash);
    expect(first.identity.sourceRevision).toBe(release);
    expect(first.identity.sourceCausalRoot).toBe(confirmed.worldRootHash);
    expect(first.recipeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.materialization.materializationHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.receipt.confirmedChunkHash).toBe(confirmed.state.authorityStateHash);
    expect(first.receipt.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const cached = await runtime.observe(request);
    expect(cached.status).toBe("VERIFIED");
    if (cached.status !== "VERIFIED") throw new Error(cached.reason);
    expect(cached.cacheHit).toBe(true);
    expect(cached.observationKey).toBe(first.observationKey);
    expect(cached.materialization.materializationHash).toBe(first.materialization.materializationHash);

    runtime.clearCache();
    const rebuilt = await runtime.observe(request);
    expect(rebuilt.status).toBe("VERIFIED");
    if (rebuilt.status !== "VERIFIED") throw new Error(rebuilt.reason);
    expect(rebuilt.cacheHit).toBe(false);
    expect(rebuilt.observationKey).toBe(first.observationKey);
    expect(rebuilt.recipeHash).toBe(first.recipeHash);
    expect(rebuilt.materialization.materializationHash).toBe(first.materialization.materializationHash);
    expect(rebuilt.receipt.receiptHash).toBe(first.receipt.receiptHash);

    const baseObservation = await runtime.observe({
      ...request,
      structureId: "aim514-generated-base",
      anchorId: "aim514-anchor-base",
    });
    expect(baseObservation.status).toBe("VERIFIED");
    if (baseObservation.status !== "VERIFIED") throw new Error(baseObservation.reason);
    expect(baseObservation.materialization.state).toBe("BASE_GRAMMAR");
    expect(baseObservation.materialization.primitives).toHaveLength(1);
    expect(baseObservation.observationKey).not.toBe(first.observationKey);

    const changedGrammar = await runtime.observe({
      ...request,
      grammar: { ...grammar, grammarVersion: "2.0.0" },
    });
    expect(changedGrammar.status).toBe("VERIFIED");
    if (changedGrammar.status !== "VERIFIED") throw new Error(changedGrammar.reason);
    expect(changedGrammar.observationKey).not.toBe(first.observationKey);
    expect(changedGrammar.recipeHash).not.toBe(first.recipeHash);

    const removed = await recordWorldChunkDelta({
      actorUserId: USER_ID,
      coordinate: CHUNK,
      baseRevision: 1,
      kind: "structure_removed",
      targetId: "aim514-real-house",
      idempotencyKey: "aim514-real:remove:0002",
      payload: { xMm: 1_200, zMm: 2_300 },
    });
    expect(removed.source).toBe("created");

    const epoch2Result = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: USER_ID,
      idempotencyKey: "aim514-real:epoch:0002",
      now: new Date("2026-01-01T00:00:01.000Z"),
    });
    expect(epoch2Result.source).toBe("created");
    const epoch2 = epoch2Result.plan.epoch;

    runtime.clearCache();
    const afterRemove = await runtime.observe({ ...request, epoch: epoch2 });
    expect(afterRemove.status).toBe("REMOVED");
    if (afterRemove.status !== "REMOVED") throw new Error("REMOVED_EXPECTED");
    expect(afterRemove.observationKey).not.toBe(first.observationKey);
    expect(afterRemove.sourceDeltaId).toBe(removed.delta.id);

    const readback2 = await worldCausalRootService.readChunk(WORLD_ID, epoch2, CHUNK);
    expect(readback2.status).toBe("VERIFIED");
    if (readback2.status !== "VERIFIED") throw new Error(readback2.reason);
    expect(readback2.state.materialized.structures).toEqual([]);

    const db = await getDb();
    if (!db) throw new Error("DATABASE_REQUIRED");
    const proofRows = await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, WORLD_ID));
    expect(proofRows).toHaveLength(2);

    console.info("STEP514_REAL_MARIADB", JSON.stringify({
      status: "VERIFIED",
      epoch,
      epoch2,
      observationKey: first.observationKey,
      recipeHash: first.recipeHash,
      materializationHash: first.materialization.materializationHash,
      confirmedChunkHash: first.receipt.confirmedChunkHash,
      sourceRevision: first.identity.sourceRevision,
      worldRootHash: first.identity.sourceCausalRoot,
      reconstructedObservationKey: rebuilt.observationKey,
      reconstructedMaterializationHash: rebuilt.materialization.materializationHash,
    }));

  }, 90_000);
});
