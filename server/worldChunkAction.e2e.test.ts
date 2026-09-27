import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aurionWorldChunkDeltas } from "../drizzle/schema";
import { getDb, recordWorldChunkDelta } from "./db";

const describeWithWorldDatabase = process.env.DATABASE_URL && process.env.AURION_WORLD_CHUNK_E2E === "1" ? describe : describe.skip;
const ACTOR_ID = 2_146_999_980;
const FOREIGN_ACTOR_ID = 2_146_999_979;
const coordinate = { x: 777_701, z: -777_701 };

async function cleanupWorldChunks() {
  const db = await getDb();
  if (!db) return;
  await db.delete(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.chunkX, coordinate.x));
}

function placeInput(actorUserId: number, idempotencyKey: string, targetId: string, xMm = 32_000) {
  return { actorUserId, coordinate, baseRevision: 1, kind: "structure_placed" as const, targetId, idempotencyKey, payload: { assetKey: "aurion_tripo_starpath_marker", xMm, zMm: 32_000 } };
}

describeWithWorldDatabase("World chunk action receipts E2E", () => {
  beforeEach(cleanupWorldChunks);
  afterEach(cleanupWorldChunks);

  it("replays an equivalent receipt exactly once and rejects idempotency-key substitution", async () => {
    const original = placeInput(ACTOR_ID, "world-e2e:receipt:0001", "structure:2146999980:world-e2e:receipt:0001");
    const first = await recordWorldChunkDelta(original);
    const replay = await recordWorldChunkDelta(original);
    expect(first).toMatchObject({ source: "created", delta: { sequence: 1, actorUserId: ACTOR_ID } });
    expect(replay).toMatchObject({ source: "persisted", delta: { id: first.delta.id, sequence: 1 } });
    await expect(recordWorldChunkDelta({ ...original, targetId: "structure:2146999980:world-e2e:substitute" })).rejects.toThrow("Idempotenzschlüssel");
    const db = await getDb();
    expect(db).not.toBeNull();
    if (db) expect(await db.select().from(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.chunkX, coordinate.x))).toHaveLength(1);
  }, 30_000);

  it("serializes simultaneous distinct receipts into a contiguous chunk sequence", async () => {
    const [first, second] = await Promise.all([
      recordWorldChunkDelta(placeInput(ACTOR_ID, "world-e2e:concurrent:0001", "structure:2146999980:world-e2e:concurrent:0001", 28_000)),
      recordWorldChunkDelta(placeInput(ACTOR_ID, "world-e2e:concurrent:0002", "structure:2146999980:world-e2e:concurrent:0002", 36_000)),
    ]);
    expect([first.delta.sequence, second.delta.sequence].sort((left, right) => left - right)).toEqual([1, 2]);
    const db = await getDb();
    expect(db).not.toBeNull();
    if (db) expect(await db.select().from(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.chunkX, coordinate.x))).toHaveLength(2);
  }, 30_000);

  it("persists an open-world homestead footprint and rejects overlapping placement", async () => {
    const homestead = {
      actorUserId: ACTOR_ID,
      coordinate,
      baseRevision: 1,
      kind: "structure_placed" as const,
      targetId: "structure:2146999980:world-e2e:homestead-1",
      idempotencyKey: "world-e2e:homestead-0001",
      payload: {
        assetKey: "aurion_open_world_homestead",
        xMm: 32_000,
        zMm: 32_000,
        rotationQuarterTurns: 0,
        footprintXmm: 6_000,
        footprintZmm: 5_000,
        placeKind: "homestead",
        ownerId: String(ACTOR_ID),
        sourceRevision: "0123456789abcdef0123456789abcdef01234567",
        placementHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    };
    const first = await recordWorldChunkDelta(homestead);
    expect(first.delta.payload.assetKey).toBe("aurion_open_world_homestead");
    await expect(recordWorldChunkDelta({
      ...homestead,
      targetId: "structure:2146999980:world-e2e:homestead-2",
      idempotencyKey: "world-e2e:homestead-0002",
      payload: { ...homestead.payload, xMm: 34_000, zMm: 32_000 },
    })).rejects.toThrow("Footprints");
    const db = await getDb();
    expect(db).not.toBeNull();
    if (db) {
      const rows = await db.select().from(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.chunkX, coordinate.x));
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.payloadJson)).toMatchObject({ assetKey: "aurion_open_world_homestead", footprintXmm: 6_000, footprintZmm: 5_000 });
    }
  }, 30_000);

  it("permits a removal only for the placing actor and only once", async () => {
    const targetId = "structure:2146999980:world-e2e:owned-place";
    await recordWorldChunkDelta(placeInput(ACTOR_ID, "world-e2e:owned-place", targetId));
    const removal = { coordinate, baseRevision: 1, kind: "structure_removed" as const, targetId, payload: { xMm: 32_000, zMm: 32_000 } };
    await expect(recordWorldChunkDelta({ ...removal, actorUserId: FOREIGN_ACTOR_ID, idempotencyKey: "world-e2e:foreign-remove" })).rejects.toThrow("Eigentümerin");
    const accepted = await recordWorldChunkDelta({ ...removal, actorUserId: ACTOR_ID, idempotencyKey: "world-e2e:owned-remove" });
    expect(accepted.delta.sequence).toBe(2);
    await expect(recordWorldChunkDelta({ ...removal, actorUserId: ACTOR_ID, idempotencyKey: "world-e2e:second-remove" })).rejects.toThrow("bereits entfernt");
  }, 30_000);
});
