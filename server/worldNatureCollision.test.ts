import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import manifest from "../shared/worldCollisionManifest.json";
import {
  WorldNatureCollision,
  sweptCircleHitsHull,
} from "./worldNatureCollision";
import { integrateZoneMovement } from "./zoneRuntime";
import {
  worldAssetCatalog,
  worldAssetRegion,
  worldAssetRegionSchema,
} from "../shared/worldAssetProtocol";
import { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import {
  worldPresenceGlobalPosition,
  worldPresenceStoragePosition,
  createWorldPresenceLease,
} from "./worldPresenceProtocol";
import {
  ZONE_POSITION_LIMIT,
  ZONE_POSITION_MIN,
  validConfirmedPresences,
} from "../shared/zonePresenceContract";
import {
  generateBaseWorldChunk,
  splitWorldChunkPositionMm,
} from "../shared/worldChunkProtocol";
import { resolveWorldChunkAction } from "./worldChunkActionProtocol";

describe("source-bound nature collision and global movement", () => {
  it("rebuilds exactly the 112 hulls from the original compressed GLB vertices", () => {
    const result = execFileSync(
      process.execPath,
      ["scripts/compile-world-colliders.mjs", "--check"],
      { encoding: "utf8" }
    );
    expect(JSON.parse(result)).toMatchObject({
      colliders: 112,
      manifestSha256: manifest.manifestSha256,
      verified: true,
    });
    expect(manifest.colliders.map(c => c.assetId).sort()).toEqual(
      worldAssetCatalog.assets
        .filter(a => a.collider)
        .map(a => a.id)
        .sort()
    );
    const region = worldAssetRegion(GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED, {
      x: 0,
      z: 0,
    });
    expect(() =>
      worldAssetRegionSchema.parse({ ...region, collisionHash: "wrong" })
    ).toThrow();
  }, 30_000);
  it("sweeps through thin obstacles, handles tangent/collinear edges, and avoids AABB false positives", () => {
    const box = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 100 },
      { x: 0, z: 100 },
    ];
    expect(
      sweptCircleHitsHull({ x: -100, z: 50 }, { x: 200, z: 50 }, box, 0)
    ).toBe(true);
    expect(
      sweptCircleHitsHull({ x: -20, z: -10 }, { x: 20, z: -10 }, box, 10)
    ).toBe(true);
    expect(
      sweptCircleHitsHull({ x: -20, z: -11 }, { x: 20, z: -11 }, box, 10)
    ).toBe(false);
    expect(sweptCircleHitsHull({ x: -10, z: 0 }, { x: 20, z: 0 }, box, 0)).toBe(
      true
    );
    const triangle = [
      { x: 0, z: 0 },
      { x: 20_000, z: 0 },
      { x: 0, z: 20_000 },
    ];
    expect(
      sweptCircleHitsHull(
        { x: 19_000, z: 19_000 },
        { x: 19_340, z: 19_000 },
        triangle
      )
    ).toBe(false);
    // Large squared cross products beyond Number.MAX_SAFE_INTEGER.
    expect(
      sweptCircleHitsHull(
        { x: 10_000, z: 10_000 },
        { x: 10_001, z: 10_000 },
        triangle,
        0
      )
    ).toBe(true);
  });
  it("selects every collider with exact quarter turns, independently of user/cache order", () => {
    const world = new WorldNatureCollision(),
      other = new WorldNatureCollision();
    const covered = new Set();
    for (let x = -12; x <= 12; x++)
      for (let z = -12; z <= 12; z++) {
        for (const obstacle of world.obstaclesForChunk({ x, z })) {
          covered.add(obstacle.assetId);
          const center = {
            x: Math.round(
              obstacle.hull.reduce((n, p) => n + p.x, 0) / obstacle.hull.length
            ),
            z: Math.round(
              obstacle.hull.reduce((n, p) => n + p.z, 0) / obstacle.hull.length
            ),
          };
          expect(sweptCircleHitsHull(center, center, obstacle.hull)).toBe(true);
          const actual = {
            x: obstacle.origin.x + center.x,
            z: obstacle.origin.z + center.z,
          };
          expect(world.blockingObstacle(actual, actual)?.id).toBe(obstacle.id);
        }
      }
    expect(covered.size).toBe(112);
    expect(world.obstaclesForChunk({ x: 0, z: -1 })).toEqual(
      other.obstaclesForChunk({ x: 0, z: -1 })
    );
    expect(() =>
      world.blockingObstacle({ x: 0, z: 0 }, { x: 0, z: 64_000 })
    ).toThrow("STEP_EXCEEDED");
  });
  it("replays travel beyond the old boundary and stops against the real Stump_3 collider", () => {
    const trace = () => {
      let p = { x: 0, z: 0 };
      const positions = [];
      for (let i = 0; i < 118; i++) {
        p = integrateZoneMovement(p, { x: 0, z: -1 });
        positions.push(p);
      }
      for (let i = 0; i < 40; i++) {
        p = integrateZoneMovement(p, { x: 1, z: 0 });
        positions.push(p);
      }
      return positions;
    };
    expect(trace()).toEqual(trace());
    expect(trace().at(-1)).toEqual({ x: 6460, z: -40120 });
    expect(splitWorldChunkPositionMm(trace().at(-1)!).coordinate).toEqual({
      x: 0,
      z: -1,
    });
    expect(integrateZoneMovement(trace().at(-1)!, { x: -1, z: 0 })).toEqual({
      x: 6120,
      z: -40120,
    });
  });
  it("round-trips the full world through centered INT storage, preserving old chunk-zero rows", () => {
    for (const x of [
      ZONE_POSITION_MIN,
      -64_000_000_000,
      -32_001,
      -32_000,
      0,
      31_999,
      32_000,
      ZONE_POSITION_LIMIT,
    ]) {
      const position = { x, z: x };
      const lease = createWorldPresenceLease({
        userId: 1,
        connectionId: "collision_position_0001",
        zoneId: "observatory_threshold",
        position,
        now: new Date(0),
      });
      const stored = worldPresenceStoragePosition(position);
      expect(Math.abs(stored.x)).toBeLessThanOrEqual(32_000);
      expect(worldPresenceGlobalPosition(lease.chunk, stored)).toEqual(
        position
      );
      expect(
        validConfirmedPresences([
          {
            userId: 1,
            entityId: "player:1",
            position,
            lastAcceptedClientSeq: 0,
          },
        ])
      ).toBe(true);
    }
    expect(
      worldPresenceGlobalPosition({ x: 0, z: 0 }, { x: 14500, z: -14500 })
    ).toEqual({ x: 14500, z: -14500 });
    expect(() =>
      worldPresenceGlobalPosition({ x: 1, z: 0 }, { x: 32000, z: 0 })
    ).toThrow();
    expect(() =>
      splitWorldChunkPositionMm({ x: ZONE_POSITION_MIN - 1, z: 0 })
    ).toThrow();
  });
  it("resolves reach in far positive and negative chunks and rejects a forged chunk", () => {
    for (const coordinate of [
      { x: 999_999, z: -999_999 },
      { x: -1, z: 1 },
    ]) {
      const base = generateBaseWorldChunk({
        worldId: GLOBAL_WORLD_ID,
        worldSeed: GLOBAL_WORLD_SEED,
        coordinate,
      });
      const intent = {
        kind: "place_structure" as const,
        coordinate,
        expectedBaseRevision: 1,
        expectedBaseHash: base.deterministicHash,
        assetKey: "aurion_tripo_starpath_marker" as const,
        xMm: 32_000,
        zMm: 32_000,
        idempotencyKey: "collision-reach:0001",
      };
      const input = {
        worldId: GLOBAL_WORLD_ID,
        worldSeed: GLOBAL_WORLD_SEED,
        actorUserId: 1,
        actorPosition: { x: coordinate.x * 64_000, z: coordinate.z * 64_000 },
        intent,
      };
      expect(resolveWorldChunkAction(input).kind).toBe("structure_placed");
      expect(() =>
        resolveWorldChunkAction({ ...input, actorPosition: { x: 0, z: 0 } })
      ).toThrow("requested chunk");
      expect(() =>
        resolveWorldChunkAction({
          ...input,
          actorPosition: {
            x: input.actorPosition.x + 4000,
            z: input.actorPosition.z,
          },
        })
      ).toThrow("reach");
    }
  });
});
