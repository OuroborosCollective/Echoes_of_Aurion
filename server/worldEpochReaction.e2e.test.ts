import { spawnSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aurionActiveCivilizations, aurionCivilizationHistoryEvents, aurionGlobalWorldEpochReceipts, aurionGlobalWorldStates, aurionRuinOrigins, aurionSettlementRebirthCandidates, aurionWorldEpochReactions, aurionWorldEpochRequests, aurionWorldPresenceLeases } from "../drizzle/schema";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../drizzle/aurionCausalitySchema";
import { getDb, getGlobalWorldPlan, listActiveWorldPresence, recordWorldPresenceLease, releaseWorldPresenceLease, resolveAndRecordGlobalWorldEpoch } from "./db";
import { WORLD_PRESENCE_LEASE_MS } from "./worldPresenceProtocol";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { globalTickRecorder } from "./causality/tickRecorder";
import { worldCausalRootService } from "./causality/worldCausalRootService";
import { aurionWorldChunkDeltas } from "../drizzle/schema";
import { recordWorldChunkDelta } from "./db";
import { createWorldChunkDelta, generateBaseWorldChunk, materializeWorldChunk } from "../shared/worldChunkProtocol";
import { GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { readConfirmedChunkAssetProjection } from "./causality/worldChunkProjectionService";
import { createWorldChunkProjectionWorkerJobV2 } from "../shared/worldChunkProjectionV2";
import { decodeChunkAssetWorkerPayload } from "../shared/worldChunkProjectionPayload";

const describeWithEpochDatabase = process.env.DATABASE_URL && process.env.NODE_ENV === "test" && process.env.AURION_WORLD_EPOCH_E2E === "1" ? describe : describe.skip;
const WORLD_ID = "echoes-of-aurion-global";
const CHUNK = { x: 777702, z: -777702 };
const chunkRows = and(eq(aurionWorldChunkDeltas.worldId, WORLD_ID), eq(aurionWorldChunkDeltas.chunkX, CHUNK.x), eq(aurionWorldChunkDeltas.chunkZ, CHUNK.z));

async function cleanupEpochState() {
  const db = await getDb();
  if (!db) return;
  await db.delete(aurionWorldChunkDeltas).where(chunkRows);
  await db.delete(aurionWorldPresenceLeases).where(eq(aurionWorldPresenceLeases.userId, 2_146_999_970));
  await db.delete(aurionWorldPresenceLeases).where(eq(aurionWorldPresenceLeases.userId, 2_146_999_971));
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

describeWithEpochDatabase("World epoch reaction receipts E2E", () => {
  beforeEach(cleanupEpochState);
  afterEach(cleanupEpochState);

  it("expires and reconnects server-recorded presence deterministically", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    await recordWorldPresenceLease({ userId: 2_146_999_970, connectionId: "epoch_e2e_connection_old_0001", zoneId: "observatory_threshold", position: { x: 0, z: 0 }, now });
    await releaseWorldPresenceLease({ connectionId: "epoch_e2e_connection_old_0001", now: new Date(now.getTime() + 1_000) });
    await recordWorldPresenceLease({ userId: 2_146_999_970, connectionId: "epoch_e2e_connection_new_0001", zoneId: "observatory_threshold", position: { x: 1_200, z: -800 }, now: new Date(now.getTime() + 2_000) });
    expect(await listActiveWorldPresence(new Date(now.getTime() + 3_000))).toEqual([expect.objectContaining({ userId: 2_146_999_970, zoneId: "observatory_threshold", position: { x: 1_200, z: -800 } })]);
    expect(await listActiveWorldPresence(new Date(now.getTime() + WORLD_PRESENCE_LEASE_MS + 2_001))).toEqual([]);
  }, 30_000);

  it("keeps active presence separate from the durable high-water value across an epoch replay", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    await recordWorldPresenceLease({ userId: 2_146_999_970, connectionId: "epoch_e2e_connection_scale_0001", zoneId: "observatory_threshold", position: { x: 0, z: 0 }, now });
    const first = await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:presence:0001", now });
    await releaseWorldPresenceLease({ connectionId: "epoch_e2e_connection_scale_0001", now: new Date(now.getTime() + 1_000) });
    const second = await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:presence:0002", now: new Date(now.getTime() + 2_000) });
    const replay = await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:presence:0002", now: new Date(now.getTime() + 2_000) });
    expect(first).toMatchObject({ source: "created", activePresenceCount: 1, plan: { epoch: 1, highWaterPlayerCount: 1 } });
    expect(second).toMatchObject({ source: "created", activePresenceCount: 0, plan: { epoch: 2, activePlayerCount: 0, highWaterPlayerCount: 1 } });
    expect(replay).toMatchObject({ source: "persisted", activePresenceCount: 0, plan: { epoch: 2, highWaterPlayerCount: 1 } });
    expect(await getGlobalWorldPlan()).toMatchObject({ epoch: 2, activePlayerCount: 0, highWaterPlayerCount: 1 });
  }, 30_000);

  it("creates exactly one immutable reaction per idempotent epoch request and replays it", async () => {
    const input = { requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:replay:0001", now: new Date("2026-01-01T00:00:00.000Z") };
    const first = await resolveAndRecordGlobalWorldEpoch(input);
    const replay = await resolveAndRecordGlobalWorldEpoch(input);
    expect(first).toMatchObject({ source: "created", plan: { epoch: 1 } });
    expect(replay).toMatchObject({ source: "persisted", plan: { epoch: 1, deterministicHash: first.plan.deterministicHash } });
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const reactions = await db.select().from(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
    expect(reactions).toHaveLength(1);
    expect(JSON.parse(reactions[0]!.reactionJson)).toMatchObject({ resolutionIndex: 1, receiptId: reactions[0]!.receiptId, deterministicHash: reactions[0]!.reactionHash });
  }, 30_000);

  it("persists real zone/chunk evidence, replays historical roots in a fresh CLI, and rejects tampering", async () => {
    const releaseSha = process.env.AURION_RELEASE_SHA;
    expect(releaseSha).toMatch(/^[a-f0-9]{40}$/);

    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.sourceRevisionOverride = releaseSha!;
    zone.tick();
    await globalTickRecorder.flushPersistence();

    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const tickReceipts = await db.select().from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.worldId, WORLD_ID));
    expect(tickReceipts).toHaveLength(1);
    expect(tickReceipts[0]).toMatchObject({
      zoneId: "observatory_threshold",
      tick: 1,
      revision: releaseSha,
    });

    const command = {
      actorUserId: 2_146_999_970, coordinate: CHUNK, baseRevision: 1,
      kind: "structure_placed" as const, targetId: "chunk-root-e2e-house",
      idempotencyKey: "chunk-root-e2e:place:0001", payload: { xMm: 1000, zMm: 1000, assetKey: "aurion_tripo_starpath_marker" },
    };
    const firstDelta = await recordWorldChunkDelta(command);
    expect((await recordWorldChunkDelta(command)).source).toBe("persisted");
    const epoch = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: 2_146_999_970,
      idempotencyKey: "world-epoch-e2e:causal-root:0001",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(epoch).toMatchObject({ source: "created", plan: { epoch: 1 } });

    const proofs = await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, WORLD_ID));
    expect(proofs).toHaveLength(1);
    const stored = JSON.parse(proofs[0]!.globalProofJson);
    expect(stored).toMatchObject({
      schema: "aurion.world.causal-root-result.v2",
      status: "VERIFIED",
      root: {
        worldId: WORLD_ID,
        epoch: 1,
        sourceRevision: releaseSha,
        zoneRoots: [{ zoneId: "observatory_threshold", fromTick: 1, toTick: 1 }],
        chunkReceipts: [expect.objectContaining({ coordinate: CHUNK, throughSequence: 1, kind: "EPOCH_SNAPSHOT" })],
      },
    });
    expect(proofs[0]!.globalProofHash).toBe(stored.root.worldRootHash);

    await expect(worldCausalRootService.replay(WORLD_ID, 1)).resolves.toMatchObject({
      status: "MATCH",
      epoch: 1,
      worldRootHash: stored.root.worldRootHash,
    });

    const idempotentReplay = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: 2_146_999_970,
      idempotencyKey: "world-epoch-e2e:causal-root:0001",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(idempotentReplay.source).toBe("persisted");
    expect(await db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, WORLD_ID))).toHaveLength(1);

    const readback = await worldCausalRootService.readChunk(WORLD_ID, 1, CHUNK);
    expect(readback.status).toBe("VERIFIED");
    if (readback.status !== "VERIFIED") throw new Error(readback.reason);
    expect(readback.membership).toBe("COMMITTED_CHUNK_RECEIPT");
    const base = generateBaseWorldChunk({ worldId: WORLD_ID, worldSeed: GLOBAL_WORLD_SEED, coordinate: CHUNK });
    expect(readback.state.materialized).toEqual(materializeWorldChunk(base, [firstDelta.delta]));
    const { authorityStateHash, ...stateBytes } = readback.state;
    expect(authorityStateHash).toBe(canonicalSha256(stateBytes));
    expect(readback.receipt).toEqual(stored.root.chunkReceipts[0]);
    await expect(worldCausalRootService.readChunk(WORLD_ID, 1, { x: CHUNK.x + 1, z: CHUNK.z })).resolves.toMatchObject({
      status: "VERIFIED", membership: "GENERATOR_AND_EMPTY_STREAM", receipt: { throughSequence: 0 },
    });

    const runCli = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/read-aurion-chunk-state.ts",
      "--world", WORLD_ID, "--epoch", "1", "--chunk-x", String(CHUNK.x), "--chunk-z", String(CHUNK.z)],
    { encoding: "utf8", timeout: 20_000, env: process.env });
    const cli = runCli();
    expect(cli.error).toBeUndefined();
    expect(cli.status, cli.stderr).toBe(0);
    const cliEvidence = JSON.parse(cli.stdout);
    expect(cliEvidence).toMatchObject({ status: "VERIFIED", worldRootHash: stored.root.worldRootHash,
      reconstructedStateHash: authorityStateHash, mutationAuthority: "none" });
    // Hash-only CLI evidence is retained in the CI log, never geometry or actor/intent fields.
    console.info("STEP28A_REAL_MARIADB_CLI", JSON.stringify(cliEvidence));

    const projected = await readConfirmedChunkAssetProjection(WORLD_ID, 1, CHUNK);
    expect(projected.status).toBe("VERIFIED");
    if (projected.status !== "VERIFIED") throw Error(projected.reason);
    expect(projected.manifest).toMatchObject({ authorityReceiptHash: readback.receipt.receiptHash, authorityStateHash, worldCausalRoot: stored.root.worldRootHash });
    expect(projected.manifest.projectionHash).not.toBe(authorityStateHash);
    const projectedBytes = new TextEncoder().encode(projected.payloadJson);
    const projectedJob = await createWorldChunkProjectionWorkerJobV2({ manifest: projected.manifest, generation: 1 });
    expect((await decodeChunkAssetWorkerPayload(projectedJob, projectedBytes)).decoded.structures).toEqual(readback.state.materialized.structures);
    expect(projected.payloadJson).not.toMatch(/actorUserId|idempotencyKey|worldSeed/);
    const explain = spawnSync(process.execPath, ["--import", "tsx", "scripts/explain-aurion-projection.ts", "--world", WORLD_ID, "--epoch", "1", "--chunk-x", String(CHUNK.x), "--chunk-z", String(CHUNK.z)], { encoding: "utf8", timeout: 20_000, env: process.env });
    expect(explain.status, explain.stderr).toBe(0);
    expect(JSON.parse(explain.stdout).manifest.projectionHash).toBe(projected.manifest.projectionHash);
    console.info("STEP28_REAL_PROJECTION_CLI", explain.stdout.trim());

    await recordWorldChunkDelta({ ...command, kind: "structure_removed", idempotencyKey: "chunk-root-e2e:remove:0002" });
    await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: command.actorUserId, idempotencyKey: "chunk-root-e2e:epoch:0002" });
    await expect(worldCausalRootService.replay(WORLD_ID, 1)).resolves.toMatchObject({ status: "MATCH" });
    await expect(worldCausalRootService.replay(WORLD_ID, 2)).resolves.toMatchObject({ status: "MATCH" });
    const second = await worldCausalRootService.readChunk(WORLD_ID, 2, CHUNK);
    expect(second).toMatchObject({ status: "VERIFIED", receipt: { throughSequence: 2, previousChunkReceiptHash: readback.receipt.receiptHash }, state: { materialized: { structures: [] } } });
    expect(runCli().status).toBe(0); // Historical prefix remains readable after later appends.

    // Valid legacy FNV is insufficient: changing actual bytes breaks the SHA-256 commitment.
    const { deterministicHash: _legacyHash, ...unsignedDelta } = firstDelta.delta;
    const changed = createWorldChunkDelta({ ...unsignedDelta, payload: { ...firstDelta.delta.payload, assetKey: "tampered" } });
    await db.update(aurionWorldChunkDeltas).set({ payloadJson: JSON.stringify(changed.payload), deterministicHash: changed.deterministicHash }).where(eq(aurionWorldChunkDeltas.id, changed.id));
    await expect(worldCausalRootService.replay(WORLD_ID, 1)).resolves.toMatchObject({ status: "FIRST_DIVERGENCE" });
    await expect(worldCausalRootService.readChunk(WORLD_ID, 1, CHUNK)).resolves.toMatchObject({ status: "UNPROVABLE" });
    expect(runCli().status).toBe(2);
    await expect(readConfirmedChunkAssetProjection(WORLD_ID, 1, CHUNK)).resolves.toMatchObject({ status: "UNPROVABLE" });
    await db.update(aurionWorldChunkDeltas).set({ payloadJson: JSON.stringify(firstDelta.delta.payload), deterministicHash: firstDelta.delta.deterministicHash }).where(eq(aurionWorldChunkDeltas.id, firstDelta.delta.id));
    await expect(worldCausalRootService.replay(WORLD_ID, 1)).resolves.toMatchObject({ status: "MATCH" });
    await db.delete(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.id, firstDelta.delta.id));
    await expect(worldCausalRootService.replay(WORLD_ID, 2)).resolves.toMatchObject({ status: "UNPROVABLE" });
    // Readback is strictly observational; it does not repair the missing row or advance gameplay.
    expect(await db.select().from(aurionWorldChunkDeltas).where(chunkRows)).toHaveLength(1);
    expect(await getGlobalWorldPlan()).toMatchObject({ epoch: 2 });
  }, 90_000);

  it("serializes concurrent distinct epoch requests into separate contiguous world and reaction receipts", async () => {
    const [first, second] = await Promise.all([
      resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_970, idempotencyKey: "world-epoch-e2e:race:0001", now: new Date("2026-01-01T00:00:00.000Z") }),
      resolveAndRecordGlobalWorldEpoch({ requestedByUserId: 2_146_999_971, idempotencyKey: "world-epoch-e2e:race:0002", now: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    expect([first.plan.epoch, second.plan.epoch].sort((left, right) => left - right)).toEqual([1, 2]);
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const reactions = await db.select().from(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, WORLD_ID));
    expect(reactions.map(reaction => reaction.epoch).sort((left, right) => left - right)).toEqual([1, 2]);
  }, 30_000);
});
