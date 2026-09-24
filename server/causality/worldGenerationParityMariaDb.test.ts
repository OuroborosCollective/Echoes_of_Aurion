import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createPool, type Pool } from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  aurionActiveCivilizations,
  aurionCivilizationHistoryEvents,
  aurionGlobalWorldEpochReceipts,
  aurionGlobalWorldStates,
  aurionRuinOrigins,
  aurionSettlementRebirthCandidates,
  aurionWorldChunkDeltas,
  aurionWorldEpochReactions,
  aurionWorldEpochRequests,
  aurionWorldPresenceLeases,
} from "../../drizzle/schema";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import {
  getDb,
  recordWorldChunkDelta,
  resolveAndRecordGlobalWorldEpoch,
} from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalCausalPersistence } from "./persistence";
import { globalTickRecorder } from "./tickRecorder";
import { worldCausalRootService } from "./worldCausalRootService";
import { StructureObservationRuntime, projectStructureObservation } from "../structureObservationRuntime";
import type { DeterministicStructureGrammar } from "../../shared/deterministicStructureGrammarProtocol";
import {
  AURION_CAUSAL_TICK_SCHEMA_V2,
} from "../../shared/aurionCausalTickContract";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { buildGameplayEvidenceFromReceipts, verifyWorldGenerationParity } from "./worldGenerationParityHarness";
import { sha256Bytes } from "./worldGenerationEvidenceHash";
import { compileDeterministicStructureGrammar } from "../deterministicStructureGrammarCompiler";
import type { WorldGenerationRuntimeIdentity } from "./worldGenerationEvidenceContract";

const enabled = process.env.NODE_ENV === "test"
  && process.env.AURION_WORLD_GENERATION_PARITY_E2E === "1"
  && Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const WORLD_ID = GLOBAL_WORLD_ID;
const ZONE = "observatory_threshold:world-generation-parity-510";
const CHUNK = { x: 777503, z: -777503 };
const USER_ID = 2_146_999_971;
const RELEASE = process.env.AURION_RELEASE_SHA ?? "";
const IMAGE = process.env.AURION_RUNTIME_IMAGE_DIGEST ?? "";
const grammar: DeterministicStructureGrammar = {
  grammarId: "maria-parity-house",
  grammarVersion: "1.0.0",
  rootRuleId: "root",
  rules: [{
    id: "root",
    body: {
      kind: "primitive",
      primitive: {
        kind: "box",
        assetKey: "aurion_maria_parity_house",
        materialKey: "stone",
        sizeMm: { x: 2_000, y: 2_500, z: 3_000 },
      },
    },
  }],
};

const socket = {
  readyState: 1,
  OPEN: 1,
  send() {},
  close() {},
} as any;

function runtimeIdentity(): WorldGenerationRuntimeIdentity {
  if (!/^[a-f0-9]{40}$/.test(RELEASE)) throw new Error("AURION_RELEASE_SHA_REQUIRED");
  if (!/^sha256:[a-f0-9]{64}$/.test(IMAGE)) throw new Error("AURION_RUNTIME_IMAGE_DIGEST_REQUIRED");
  return {
    sourceRevision: RELEASE,
    runtimeRevision: RELEASE,
    runtimeImageDigest: IMAGE,
    causalTickSchema: AURION_CAUSAL_TICK_SCHEMA_V2,
    rulesetVersion: "aurion.zone.rules.v2",
  };
}

async function cleanup(pool: Pool): Promise<void> {
  await pool.query(
    "DELETE FROM aurionWorldChunkDeltas WHERE worldId=? AND chunkX=? AND chunkZ=?",
    [WORLD_ID, CHUNK.x, CHUNK.z],
  );
  await pool.query("DELETE FROM aurionWorldPresenceLeases WHERE userId=?", [USER_ID]);
  const db = await getDb();
  if (!db) throw new Error("WORLD_GENERATION_PARITY_DATABASE_REQUIRED");
  await db.delete(aurionSettlementRebirthCandidates).where(eq(aurionSettlementRebirthCandidates.worldId, WORLD_ID));
  await db.delete(aurionRuinOrigins);
  await db.delete(aurionCivilizationHistoryEvents).where(eq(aurionCivilizationHistoryEvents.worldId, WORLD_ID));
  await db.delete(aurionActiveCivilizations).where(eq(aurionActiveCivilizations.worldId, WORLD_ID));
  await db.delete(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
  await db.delete(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.worldId, WORLD_ID));
  await db.delete(aurionGlobalWorldEpochReceipts).where(eq(aurionGlobalWorldEpochReceipts.worldId, WORLD_ID));
  await db.delete(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, WORLD_ID));
  await db.delete(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.zoneId, ZONE));
  await db.delete(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, WORLD_ID));
}

function checksum(path: string) {
  return {
    path,
    sha256: sha256Bytes(readFileSync(path)),
  };
}

suite("AIM-510 world generation parity real MariaDB", () => {
  let pool: Pool;

  beforeAll(async () => {
    expect(RELEASE).toMatch(/^[a-f0-9]{40}$/);
    expect(IMAGE).toMatch(/^sha256:[a-f0-9]{64}$/);
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "mariadb"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<any[]>("SELECT DATABASE() AS name");
    expect(rows[0]?.name).toBe(url.pathname.slice(1));
  });

  beforeEach(async () => {
    await cleanup(pool);
  });

  afterAll(async () => {
    if (pool) {
      await cleanup(pool);
      await pool.end();
    }
  });

  it("proves the real generation -> observation -> materialization -> causal replay path", async () => {
    const identity = runtimeIdentity();

    const zone = new AuthoritativeMovementZone(ZONE as any);
    zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
    zone.sourceRevisionOverride = RELEASE;
    const { connectionId } = zone.join({
      userId: USER_ID,
      socket,
      combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
    });

    for (let tick = 1; tick <= 4; tick += 1) {
      zone.submitMovement(connectionId, {
        type: "move",
        clientSeq: tick,
        input: tick % 2 === 0 ? { x: 0, z: -1 } : { x: 1, z: 0 },
      });
      zone.tick();
    }
    await globalTickRecorder.flushPersistence();

    const placed = await recordWorldChunkDelta({
      actorUserId: USER_ID,
      coordinate: CHUNK,
      baseRevision: 1,
      kind: "structure_placed",
      targetId: "aim510-real-house",
      idempotencyKey: "aim510-real:place:0001",
      payload: {
        xMm: 1_200,
        zMm: 2_300,
        assetKey: "aurion_confirmed_house",
      },
    });
    expect(placed.source).toBe("created");

    const epoch = (await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: USER_ID,
      idempotencyKey: "aim510-real:epoch:0001",
      now: new Date("2026-01-01T00:00:00.000Z"),
    })).plan.epoch;

    const observationRuntime = new StructureObservationRuntime();
    const observation = await observationRuntime.observe({
      worldId: WORLD_ID,
      epoch,
      chunkCoordinate: CHUNK,
      structureId: "aim510-real-house",
      anchorId: "aim510-anchor-house",
      grammar,
    });
    expect(observation.status).toBe("VERIFIED");
    if (observation.status !== "VERIFIED") throw new Error(observation.reason);
    expect(observation.identity.sourceRevision).toBe(RELEASE);
    expect(observation.materialization.materializationHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const projection = projectStructureObservation(observation);
    expect(projection.projectionHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const { AurionHeadlessCausalOracle } = await import("./headlessCausalOracle");
    const oracle = await (new AurionHeadlessCausalOracle()).replayRange({
      zoneId: ZONE,
      fromTick: 3,
      toTick: 4,
    });
    expect(oracle.status).toBe("MATCH");

    const receipts = await globalCausalPersistence.getTicksInRange(ZONE, 3, 4);
    const gameplayEvidence = buildGameplayEvidenceFromReceipts(receipts.map(entry => entry.receipt), 3, 4);
    const generation = compileDeterministicStructureGrammar({
      worldId: observation.identity.worldId,
      worldSeedHash: observation.identity.worldSeedHash,
      grammar,
      chunkCoordinate: CHUNK,
      anchorId: observation.identity.anchorId,
      sourceCausalRoot: observation.identity.sourceCausalRoot,
      sourceRevision: RELEASE,
    });

    const result = verifyWorldGenerationParity({
      runId: "aim510-real-mariadb",
      generation,
      observation,
      projection,
      runtime: identity,
      referenceRuntime: identity,
      gameplay: gameplayEvidence,
      oracle,
      artifactChecksums: [
        checksum("dist-traefik-runtime/manifest.json"),
        checksum("dist-traefik-runtime/checksums.sha256"),
      ],
      createdAt: "2026-09-24T00:00:00.000Z",
    });

    expect(result.verified).toBe(true);
    expect(result.evidence.status).toBe("MATCH");
    expect(result.evidence.runtimeImageDigest).toBe(IMAGE);
    expect(result.evidence.sourceRevision).toBe(RELEASE);
    expect(result.evidence.observationKey).toBe(observation.observationKey);
    expect(result.evidence.oracleResultHash).toBe(oracle.oracleResultHash);

    const evidencePath = process.env.AURION_WORLD_GENERATION_PARITY_EVIDENCE_PATH?.trim();
    if (evidencePath) writeFileSync(evidencePath, JSON.stringify(result.evidence, null, 2) + "\n", "utf8");

    console.info("AIM510_REAL_MARIADB", JSON.stringify({
      status: result.evidence.status,
      sourceRevision: result.evidence.sourceRevision,
      runtimeImageDigest: result.evidence.runtimeImageDigest,
      observationKey: result.evidence.observationKey,
      recipeHash: result.evidence.recipeHash,
      materializationHash: result.evidence.materializationHash,
      oracleResultHash: result.evidence.oracleResultHash,
    }));
  }, 120_000);
});
