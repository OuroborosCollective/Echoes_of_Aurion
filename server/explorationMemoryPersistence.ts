import { and, asc, eq } from "drizzle-orm";
import { aurionExplorationMemoryProjections } from "../drizzle/schema";
import { getDb, GLOBAL_WORLD_ID } from "./db";
import { readConfirmedChunkAssetProjection } from "./causality/worldChunkProjectionService";
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
  const expected = await hashExplorationMemoryRecord({ ...value, memoryHash: undefined as never });
  if (expected !== row.memoryHash) throw new Error("EXPLORATION_MEMORY_HASH_MISMATCH");
  return Object.freeze(value);
}

export async function recordExplorationDiscovery(
  userId:number,
  input:{epoch:number;chunkX:number;chunkZ:number;observedAtLogicalFrame:number}
) {
  assertInput(userId,input);
  const projection = await readConfirmedChunkAssetProjection(GLOBAL_WORLD_ID,input.epoch,{x:input.chunkX,z:input.chunkZ});
  if (projection.status !== "VERIFIED") return projection;

  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  return db.transaction(async (tx:Transaction) => {
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
        firstDiscoveryReceiptHash: projection.manifest.authorityReceiptHash,
        latestConfirmedVisitSequence: input.observedAtLogicalFrame,
        latestProjectionHash: projection.manifest.projectionHash,
        sourceRevision: projection.sourceRevision,
      };
      const record = await createExplorationMemoryRecord(base);
      await tx.insert(aurionExplorationMemoryProjections).values({
        id: storageId(userId,GLOBAL_WORLD_ID,input.epoch,input.chunkX,input.chunkZ),
        ...base,
        memoryHash: record.memoryHash,
      });
    } else if (input.observedAtLogicalFrame > current.latestConfirmedVisitSequence ||
               current.latestProjectionHash !== projection.manifest.projectionHash ||
               current.sourceRevision !== projection.sourceRevision) {
      const base = {
        userId: current.userId,
        worldId: current.worldId,
        worldEpoch: current.worldEpoch,
        chunkX: current.chunkX,
        chunkZ: current.chunkZ,
        firstDiscoveryReceiptHash: current.firstDiscoveryReceiptHash,
        latestConfirmedVisitSequence: Math.max(current.latestConfirmedVisitSequence,input.observedAtLogicalFrame),
        latestProjectionHash: projection.manifest.projectionHash,
        sourceRevision: projection.sourceRevision,
      };
      const record = await createExplorationMemoryRecord(base);
      await tx.update(aurionExplorationMemoryProjections)
        .set({
          latestConfirmedVisitSequence: base.latestConfirmedVisitSequence,
          latestProjectionHash: base.latestProjectionHash,
          sourceRevision: base.sourceRevision,
          memoryHash: record.memoryHash,
        })
        .where(eq(aurionExplorationMemoryProjections.id,current.id));
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
