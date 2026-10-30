import { and, asc, eq } from "drizzle-orm";
import { aurionExplorationMemoryProjections, aurionGlobalWorldStates } from "../drizzle/schema";
import { aurionCausalTickReceipts } from "../drizzle/aurionCausalitySchema";
import { getDb, GLOBAL_WORLD_ID } from "./db";
import { readConfirmedChunkAssetProjection } from "./causality/worldChunkProjectionService";
import { worldCausalRootService } from "./causality/worldCausalRootService";
import { globalZoneRegistry } from "./zoneRuntime";
import { EXPLORATION_ZONE_ID, requireExplorationActorConnection, verifyExplorationActorObservation } from "./explorationActorObservation";
import { WORLD_CHUNK_COORDINATE_LIMIT } from "./worldChunkProtocol";
import { createExplorationMemoryRecord, hashExplorationMemoryRecord, type ExplorationMemoryRecord } from "../shared/explorationMemoryProtocol";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const storageId = (userId:number, worldId:string, epoch:number, x:number, z:number) =>
  "exp_" + Buffer.from([String(userId),worldId,String(epoch),String(x),String(z)].join("|")).toString("base64url").slice(0, 120);

function assertInput(userId:number, input:{ epoch:number; chunkX:number; chunkZ:number; observedAtLogicalFrame:number }) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("EXPLORATION_OWNER_INVALID");
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 1) throw new Error("EXPLORATION_EPOCH_INVALID");
  if (!Number.isSafeInteger(input.observedAtLogicalFrame) || input.observedAtLogicalFrame < 0) throw new Error("EXPLORATION_SEQUENCE_INVALID");
  if (!Number.isSafeInteger(input.chunkX) || Math.abs(input.chunkX) > WORLD_CHUNK_COORDINATE_LIMIT) throw new Error("EXPLORATION_CHUNK_X_INVALID");
  if (!Number.isSafeInteger(input.chunkZ) || Math.abs(input.chunkZ) > WORLD_CHUNK_COORDINATE_LIMIT) throw new Error("EXPLORATION_CHUNK_Z_INVALID");
}

function rowToRecord(row: typeof aurionExplorationMemoryProjections.$inferSelect): ExplorationMemoryRecord {
  return {
    schema: "aurion.exploration-memory.v1",
    userId: row.userId,
    worldId: row.worldId,
    worldEpoch: row.worldEpoch,
    chunkX: row.chunkX,
    chunkZ: row.chunkZ,
    firstDiscoveryReceiptHash: row.firstDiscoveryReceiptHash,
    latestConfirmedVisitSequence: row.latestConfirmedVisitSequence,
    latestProjectionHash: row.latestProjectionHash,
    sourceRevision: row.sourceRevision,
    memoryHash: row.memoryHash,
  };
}

async function verifyRow(row: typeof aurionExplorationMemoryProjections.$inferSelect): Promise<ExplorationMemoryRecord> {
  const value = rowToRecord(row);
  const { memoryHash: _memoryHash, ...base } = value;
  const expected = await hashExplorationMemoryRecord(base);
  if (expected !== row.memoryHash) throw new Error("EXPLORATION_MEMORY_HASH_MISMATCH");
  return Object.freeze(value);
}

export async function recordExplorationDiscovery(
  userId:number,
  input:{epoch:number;chunkX:number;chunkZ:number;observedAtLogicalFrame:number}
) {
  assertInput(userId,input);
  const zone = globalZoneRegistry.find(EXPLORATION_ZONE_ID);
  const coordinate = { x: input.chunkX, z: input.chunkZ };
  const connectionId = requireExplorationActorConnection(zone, userId, coordinate);
  const projection = await readConfirmedChunkAssetProjection(GLOBAL_WORLD_ID,input.epoch,{x:input.chunkX,z:input.chunkZ});
  if (projection.status !== "VERIFIED") return projection;
  const root = await worldCausalRootService.read(GLOBAL_WORLD_ID, input.epoch);
  if (root?.status !== "VERIFIED" || root.root.worldRootHash !== projection.manifest.worldCausalRoot) {
    throw new Error("EXPLORATION_WORLD_ROOT_UNPROVABLE");
  }
  const zoneRoot = root.root.zoneRoots.find(item => item.zoneId === EXPLORATION_ZONE_ID);
  if (!zoneRoot || !zone) throw new Error("EXPLORATION_ACTOR_ROOT_UNPROVABLE");

  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  return db.transaction(async (tx:Transaction) => {
    // Serialize with epoch advancement; never use the permissive epoch-zero
    // fallback from getGlobalWorldPlan as an authorization decision.
    const [world] = await tx.select().from(aurionGlobalWorldStates)
      .where(eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID)).for("update");
    if (!world || world.epoch !== input.epoch) throw new Error("EXPLORATION_WORLD_EPOCH_STALE");
    const [stored] = await tx.select({
      worldId: aurionCausalTickReceipts.worldId, zoneId: aurionCausalTickReceipts.zoneId,
      tick: aurionCausalTickReceipts.tick, receiptHash: aurionCausalTickReceipts.receiptHash,
      postStateHash: aurionCausalTickReceipts.postStateHash,
    }).from(aurionCausalTickReceipts).where(and(
      eq(aurionCausalTickReceipts.worldId, GLOBAL_WORLD_ID),
      eq(aurionCausalTickReceipts.zoneId, EXPLORATION_ZONE_ID),
      eq(aurionCausalTickReceipts.tick, zoneRoot.toTick),
    )).limit(1);
    if (!stored) throw new Error("EXPLORATION_ACTOR_RECEIPT_UNPROVABLE");
    const observation = verifyExplorationActorObservation({
      zone, userId, coordinate, connectionId, stored,
      epochFromTick: zoneRoot.fromTick, epochToTick: zoneRoot.toTick,
      epochSourceRevision: zoneRoot.sourceRevision, epochRulesetVersion: zoneRoot.rulesetVersion,
      epochLastReceiptHash: zoneRoot.lastReceiptHash,
    });
    const current = (await tx.select().from(aurionExplorationMemoryProjections).where(and(
      eq(aurionExplorationMemoryProjections.userId,userId),
      eq(aurionExplorationMemoryProjections.worldId,GLOBAL_WORLD_ID),
      eq(aurionExplorationMemoryProjections.worldEpoch,input.epoch),
      eq(aurionExplorationMemoryProjections.chunkX,input.chunkX),
      eq(aurionExplorationMemoryProjections.chunkZ,input.chunkZ),
    )).limit(1))[0];

    if (!current) {
      const base = {
        userId,
        worldId: GLOBAL_WORLD_ID,
        worldEpoch: input.epoch,
        chunkX: input.chunkX,
        chunkZ: input.chunkZ,
        firstDiscoveryReceiptHash: observation.receiptHash,
        latestConfirmedVisitSequence: observation.tick,
        latestProjectionHash: projection.manifest.projectionHash,
        sourceRevision: projection.sourceRevision,
      };
      const record = await createExplorationMemoryRecord(base);
      if (requireExplorationActorConnection(zone, userId, coordinate) !== connectionId) throw new Error("EXPLORATION_ACTOR_SESSION_CHANGED");
      await tx.insert(aurionExplorationMemoryProjections).values({
        id: storageId(userId,GLOBAL_WORLD_ID,input.epoch,input.chunkX,input.chunkZ),
        ...base,
        memoryHash: record.memoryHash,
      });
    } else {
      // Older records used a chunk receipt and a client-supplied frame. Keep
      // them for compatibility, but do not silently upgrade them to actor proof.
      await verifyRow(current);
      if (current.firstDiscoveryReceiptHash !== observation.receiptHash ||
          current.latestConfirmedVisitSequence !== observation.tick ||
          current.latestProjectionHash !== projection.manifest.projectionHash ||
          current.sourceRevision !== projection.sourceRevision) {
        throw new Error("EXPLORATION_MEMORY_PROVENANCE_MISMATCH");
      }
    }

    const readback = (await tx.select().from(aurionExplorationMemoryProjections).where(and(
      eq(aurionExplorationMemoryProjections.userId,userId),
      eq(aurionExplorationMemoryProjections.worldId,GLOBAL_WORLD_ID),
      eq(aurionExplorationMemoryProjections.worldEpoch,input.epoch),
      eq(aurionExplorationMemoryProjections.chunkX,input.chunkX),
      eq(aurionExplorationMemoryProjections.chunkZ,input.chunkZ),
    )).limit(1))[0];
    if (!readback) throw new Error("EXPLORATION_MEMORY_READBACK_MISSING");
    const verified = await verifyRow(readback);
    if (requireExplorationActorConnection(zone, userId, coordinate) !== connectionId) throw new Error("EXPLORATION_ACTOR_SESSION_CHANGED");
    return Object.freeze({ status:"VERIFIED" as const, memory:verified, mutationAuthority:"none" as const });
  });
}

export async function readExplorationMemory(userId:number, worldId:string, worldEpoch:number) {
  if (!Number.isSafeInteger(userId) || userId<1) throw new Error("EXPLORATION_OWNER_INVALID");
  if (!Number.isSafeInteger(worldEpoch) || worldEpoch<1) throw new Error("EXPLORATION_EPOCH_INVALID");
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const rows = await db.select().from(aurionExplorationMemoryProjections).where(and(
    eq(aurionExplorationMemoryProjections.userId,userId),
    eq(aurionExplorationMemoryProjections.worldId,worldId),
    eq(aurionExplorationMemoryProjections.worldEpoch,worldEpoch),
  )).orderBy(asc(aurionExplorationMemoryProjections.chunkX),asc(aurionExplorationMemoryProjections.chunkZ));
  const records = [];
  for (const row of rows) records.push(await verifyRow(row));
  return Object.freeze({schema:"aurion.exploration-memory.v1" as const,worldId,worldEpoch,records:Object.freeze(records),mutationAuthority:"none" as const});
}
