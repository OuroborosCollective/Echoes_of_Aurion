import { and, eq, gte, lte } from "drizzle-orm";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import { aurionWorldChunkDeltas } from "../../drizzle/schema";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { createCanonicalChunkReceipt, createChunkUniverse, chunkKey, chunkCoordinateSchema } from "../../shared/aurionChunkStateContract";
import { buildChunkWorldRoot, parseAnyWorldRootResult, verifyAnyWorldRoot, WORLD_CHUNK_ROOT_SCHEMA, type AnyWorldRootResult } from "../../shared/aurionChunkWorldRootContract";
import { createWorldChunkDelta, type WorldChunkCoordinate, type WorldChunkDelta } from "../../shared/worldChunkProtocol";
import { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } from "../../shared/worldIdentity";
import { operationalNow } from "../../shared/operationalClock";
import { activeProvenance } from "../aurionProvenance";
import {
  AURION_WORLD_CAUSAL_ZONE_IDS,
  computeWorldCausalRoot,
  computeZoneEpochRoot,
  type AurionZoneReceiptReference,
} from "../../shared/aurionWorldCausalRootContract";
import { getDb } from "../db";

export type WorldCausalRootReplayVerdict =
  | Readonly<{ status: "MATCH"; worldRootHash: string; epoch: number }>
  | Readonly<{ status: "FIRST_DIVERGENCE"; expectedHash: string; observedHash: string; epoch: number }>
  | Readonly<{ status: "UNPROVABLE"; reason: string; epoch: number }>;

/** Coalesces one immutable epoch replay and bounds both age and retained epochs. */
export class VerifiedEpochReplayCache {
  private readonly entries = new Map<string, { expiresAt: number; value: WorldCausalRootReplayVerdict }>();
  private readonly inflight = new Map<string, Promise<WorldCausalRootReplayVerdict>>();
  constructor(private readonly maximum = 32, private readonly ttlMs = 10_000, private readonly now = operationalNow) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(ttlMs) || ttlMs < 1) throw Error("WORLD_EPOCH_CACHE_CONFIGURATION_INVALID");
  }
  async read(key: string, verify: () => Promise<WorldCausalRootReplayVerdict>) {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.entries.delete(key); this.entries.set(key, cached);
      return cached.value;
    }
    if (cached) this.entries.delete(key);
    const active = this.inflight.get(key);
    if (active) return active;
    const pending = verify().then(value => {
      if (value.status === "MATCH") {
        this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
        while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value!);
      }
      return value;
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, pending);
    return pending;
  }
}

function receiptReference(row: typeof aurionCausalTickReceipts.$inferSelect): AurionZoneReceiptReference {
  return {
    worldId: row.worldId,
    zoneId: row.zoneId,
    tick: row.tick,
    sourceRevision: row.revision,
    rulesetVersion: row.rulesetVersion,
    previousReceiptHash: row.previousReceiptHash,
    receiptHash: row.receiptHash,
  };
}

export class AurionWorldCausalRootService {
  private readonly projectionReplayCache = new VerifiedEpochReplayCache();
  async read(worldId: string, epoch: number): Promise<AnyWorldRootResult | null> {
    if (!Number.isSafeInteger(epoch) || epoch < 1) return null;
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(aurionGlobalStateProofs).where(and(
      eq(aurionGlobalStateProofs.worldId, worldId),
      eq(aurionGlobalStateProofs.epoch, epoch),
    )).limit(1);
    if (!row) return null;
    const parsed = parseAnyWorldRootResult(row.globalProofJson);
    if (!parsed || row.globalProofHash !== parsed.evidenceHash || row.status !== parsed.status) return null;
    if (parsed.status === "VERIFIED" && (parsed.root.worldId !== worldId || parsed.root.epoch !== epoch)) return null;
    return parsed;
  }

  async replay(worldId: string, epoch: number): Promise<WorldCausalRootReplayVerdict> {
    const persisted = await this.read(worldId, epoch);
    if (!persisted) return Object.freeze({ status: "UNPROVABLE", reason: "WORLD_ROOT_EVIDENCE_MISSING", epoch });
    if (persisted.status !== "VERIFIED" || !persisted.root) {
      return Object.freeze({ status: "UNPROVABLE", reason: persisted.reason ?? "WORLD_ROOT_UNPROVABLE", epoch });
    }
    if (!verifyAnyWorldRoot(persisted.root)) {
      return Object.freeze({ status: "FIRST_DIVERGENCE", expectedHash: persisted.root.worldRootHash, observedHash: "INVALID_STORED_ROOT", epoch });
    }

    const db = await getDb();
    if (!db) return Object.freeze({ status: "UNPROVABLE", reason: "DATABASE_UNAVAILABLE", epoch });
    const recomputedZoneRoots = [];
    for (const zoneRoot of persisted.root.zoneRoots) {
      const rows = await db.select().from(aurionCausalTickReceipts).where(and(
        eq(aurionCausalTickReceipts.worldId, worldId),
        eq(aurionCausalTickReceipts.zoneId, zoneRoot.zoneId),
        gte(aurionCausalTickReceipts.tick, zoneRoot.fromTick),
        lte(aurionCausalTickReceipts.tick, zoneRoot.toTick),
      )).orderBy(aurionCausalTickReceipts.tick);
      if (rows.length !== zoneRoot.toTick - zoneRoot.fromTick + 1) {
        return Object.freeze({ status: "UNPROVABLE", reason: `ZONE_RECEIPT_RANGE_INCOMPLETE:${zoneRoot.zoneId}`, epoch });
      }
      try {
        recomputedZoneRoots.push(computeZoneEpochRoot(rows.map(receiptReference)));
      } catch (error) {
        return Object.freeze({ status: "UNPROVABLE", reason: error instanceof Error ? error.message : String(error), epoch });
      }
    }

    const zoneResult = computeWorldCausalRoot({
      worldId,
      epoch,
      sourceRevision: persisted.root.sourceRevision,
      rulesetVersion: persisted.root.rulesetVersion,
      expectedZoneIds: AURION_WORLD_CAUSAL_ZONE_IDS,
      zoneRoots: recomputedZoneRoots,
      previousWorldRoot: persisted.root.previousWorldRoot,
      previousWorldRootProvable: true,
    });
    let recomputed: AnyWorldRootResult = zoneResult;
    if (persisted.root.schema === WORLD_CHUNK_ROOT_SCHEMA) {
      if (worldId !== GLOBAL_WORLD_ID || persisted.root.sourceRevision !== activeProvenance.sourceRevision) {
        return Object.freeze({ status: "UNPROVABLE", reason: "CHUNK_GENERATOR_REVISION_UNAVAILABLE", epoch });
      }
      if (canonicalSha256(createChunkUniverse(worldId, GLOBAL_WORLD_SEED)) !== canonicalSha256(persisted.root.chunkUniverse)) {
        return Object.freeze({ status: "UNPROVABLE", reason: "CHUNK_GENERATOR_IDENTITY_MISMATCH", epoch });
      }
      const previous = epoch === 1 ? null : await this.read(worldId, epoch - 1);
      if (epoch > 1 && (!previous || previous.status !== "VERIFIED" || previous.root.worldRootHash !== persisted.root.previousWorldRoot)) {
        return Object.freeze({ status: "UNPROVABLE", reason: "PREVIOUS_WORLD_ROOT_UNPROVABLE", epoch });
      }
      const deltas: WorldChunkDelta[] = [];
      for (const receipt of persisted.root.chunkReceipts) {
        const stream = await this.readChunkPrefix(worldId, receipt.coordinate, receipt.throughSequence);
        if (!stream) return Object.freeze({ status: "UNPROVABLE", reason: "CHUNK_DELTA_RANGE_INCOMPLETE_OR_INVALID", epoch });
        deltas.push(...stream);
      }
      recomputed = buildChunkWorldRoot({ zoneResult, worldId, epoch, sourceRevision: persisted.root.sourceRevision, worldSeed: GLOBAL_WORLD_SEED, deltas, previous });
    }
    if (recomputed.status !== "VERIFIED" || !recomputed.root) {
      return Object.freeze({ status: "UNPROVABLE", reason: recomputed.reason ?? "RECOMPUTE_UNPROVABLE", epoch });
    }
    if (recomputed.root.worldRootHash !== persisted.root.worldRootHash) {
      return Object.freeze({
        status: "FIRST_DIVERGENCE",
        expectedHash: persisted.root.worldRootHash,
        observedHash: recomputed.root.worldRootHash,
        epoch,
      });
    }
    return Object.freeze({ status: "MATCH", worldRootHash: recomputed.root.worldRootHash, epoch });
  }

  private async readChunkPrefix(worldId: string, coordinate: WorldChunkCoordinate, throughSequence: number): Promise<WorldChunkDelta[] | null> {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(aurionWorldChunkDeltas).where(and(
      eq(aurionWorldChunkDeltas.worldId, worldId), eq(aurionWorldChunkDeltas.chunkX, coordinate.x),
      eq(aurionWorldChunkDeltas.chunkZ, coordinate.z), lte(aurionWorldChunkDeltas.sequence, throughSequence),
    )).orderBy(aurionWorldChunkDeltas.sequence).limit(throughSequence + 1);
    if (rows.length !== throughSequence) return null;
    try {
      return rows.map((row, index) => {
        if (row.sequence !== index + 1) throw new Error("CHUNK_SEQUENCE_GAP");
        const delta = createWorldChunkDelta({
          id: row.id, worldId: row.worldId, coordinate: { x: row.chunkX, z: row.chunkZ },
          baseRevision: row.baseRevision, sequence: row.sequence, kind: row.kind, targetId: row.targetId,
          actorUserId: row.actorUserId, idempotencyKey: row.idempotencyKey, payload: JSON.parse(row.payloadJson),
        });
        if (delta.deterministicHash !== row.deterministicHash) throw new Error("CHUNK_DELTA_HASH_MISMATCH");
        return delta;
      });
    } catch { return null; }
  }

  /** Read-only reconstruction from a replayed epoch, never the current mutable view. */
  async readChunk(worldId: string, epoch: number, coordinate: WorldChunkCoordinate) {
    chunkCoordinateSchema.parse(coordinate);
    const unprovable = (reason: string) => Object.freeze({ status: "UNPROVABLE" as const, reason });
    const replay = await this.projectionReplayCache.read(`${worldId}:${epoch}`, () => this.replay(worldId, epoch));
    if (replay.status !== "MATCH") return unprovable(replay.status === "UNPROVABLE" ? replay.reason : "WORLD_ROOT_DIVERGENCE");
    const result = await this.read(worldId, epoch);
    if (result?.status !== "VERIFIED" || result.root.schema !== WORLD_CHUNK_ROOT_SCHEMA || result.root.worldRootHash !== replay.worldRootHash) return unprovable("CHUNK_WORLD_ROOT_UNAVAILABLE");
    const stored = result.root.chunkReceipts.find(r => chunkKey(r.coordinate) === chunkKey(coordinate));
    const deltas = stored ? await this.readChunkPrefix(worldId, coordinate, stored.throughSequence) : [];
    if (!deltas) return unprovable("CHUNK_DELTA_RANGE_INCOMPLETE_OR_INVALID");
    try {
      const { state, receipt } = createCanonicalChunkReceipt({
        worldId, epoch, coordinate, worldSeed: GLOBAL_WORLD_SEED, sourceRevision: result.root.sourceRevision,
        deltas, previousChunkReceiptHash: stored?.previousChunkReceiptHash ?? null,
      });
      if (stored && receipt.receiptHash !== stored.receiptHash) return unprovable("CHUNK_STATE_DIVERGENCE");
      return Object.freeze({
        status: "VERIFIED" as const,
        membership: stored ? "COMMITTED_CHUNK_RECEIPT" as const : "GENERATOR_AND_EMPTY_STREAM" as const,
        worldRootHash: result.root.worldRootHash, receipt, state,
      });
    } catch { return unprovable("CHUNK_STATE_INVALID"); }
  }
}

export const worldCausalRootService = new AurionWorldCausalRootService();
