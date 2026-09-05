import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import {
  applyWorldChunkAction,
  recordWorldPresenceLease,
  listActiveWorldPresence,
} from "./db";
import { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import { generateBaseWorldChunk } from "../shared/worldChunkProtocol";
import {
  ZONE_POSITION_MIN,
  ZONE_POSITION_LIMIT,
} from "../shared/zonePresenceContract";

const suite =
  process.env.AURION_COLLISION_E2E === "1" && process.env.DATABASE_URL
    ? describe
    : describe.skip;
suite("real MariaDB world position and chunk action roundtrip", () => {
  let pool: Pool;
  const userId = 9340001,
    connectionId = "nature_collision_db_0001";
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_group_test")
      throw Error("ISOLATED_COLLISION_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
  });
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM aurionWorldChunkDeltas WHERE actorUserId=?", [
      userId,
    ]);
    await pool.query(
      "DELETE FROM aurionWorldPresenceLeases WHERE connectionId=?",
      [connectionId]
    );
    await pool.end();
  });
  it("preserves exact extrema in the existing signed INT columns", async () => {
    for (const position of [
      { x: 0, z: 0 },
      { x: 6460, z: -40120 },
      { x: ZONE_POSITION_MIN, z: ZONE_POSITION_LIMIT },
      { x: ZONE_POSITION_LIMIT, z: ZONE_POSITION_MIN },
    ]) {
      const lease = await recordWorldPresenceLease({
        userId,
        connectionId,
        zoneId: "observatory_threshold",
        position,
      });
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT chunkX,chunkZ,positionX,positionZ FROM aurionWorldPresenceLeases WHERE connectionId=?",
        [connectionId]
      );
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.chunkX).toBe(lease.chunk.x);
      expect(row.chunkZ).toBe(lease.chunk.z);
      expect(row.positionX).toBeGreaterThanOrEqual(-32000);
      expect(row.positionX).toBeLessThan(32000);
      expect(row.chunkX * 64000 + row.positionX).toBe(position.x);
      expect(row.chunkZ * 64000 + row.positionZ).toBe(position.z);
      expect(
        (await listActiveWorldPresence()).find(p => p.userId === userId)
          ?.position
      ).toEqual(position);
    }
  });
  it("commits a far-chunk action from reconstructed presence and rejects a remote chunk", async () => {
    const coordinate = { x: 999999, z: -999999 };
    const base = generateBaseWorldChunk({
      worldId: GLOBAL_WORLD_ID,
      worldSeed: GLOBAL_WORLD_SEED,
      coordinate,
    });
    await recordWorldPresenceLease({
      userId,
      connectionId,
      zoneId: "observatory_threshold",
      position: { x: coordinate.x * 64000, z: coordinate.z * 64000 },
    });
    const intent = {
      kind: "place_structure" as const,
      coordinate,
      expectedBaseRevision: 1,
      expectedBaseHash: base.deterministicHash,
      assetKey: "aurion_tripo_starpath_marker" as const,
      xMm: 32000,
      zMm: 32000,
      idempotencyKey: "collision-db:far-structure:0001",
    };
    const result = await applyWorldChunkAction({ actorUserId: userId, intent });
    expect(result).toBeDefined();
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT chunkX,chunkZ,actorUserId FROM aurionWorldChunkDeltas WHERE idempotencyKey=?",
      [intent.idempotencyKey]
    );
    expect(rows).toEqual([
      expect.objectContaining({
        chunkX: coordinate.x,
        chunkZ: coordinate.z,
        actorUserId: userId,
      }),
    ]);
    const remote = { x: 0, z: 0 },
      remoteBase = generateBaseWorldChunk({
        worldId: GLOBAL_WORLD_ID,
        worldSeed: GLOBAL_WORLD_SEED,
        coordinate: remote,
      });
    await expect(
      applyWorldChunkAction({
        actorUserId: userId,
        intent: {
          ...intent,
          coordinate: remote,
          expectedBaseHash: remoteBase.deterministicHash,
          idempotencyKey: "collision-db:remote-denied:0001",
        },
      })
    ).rejects.toThrow();
  });
});
