// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import * as THREE from "three";
import { testGlb } from "../../../../server/glbImportFixtures";
import { buildGlbImportPlan } from "../../../../server/glbImportPlan";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import {
  AURION_STARTER_CITY_WALL_HEADROOM_KEY,
  AURION_STARTER_CITY_WALL_LODS,
  starterCityWallAllocation,
} from "@shared/aurionStarterCityWallContract";
import { assetBudgets, GlbResourcePool, glbResourcePool, type AssetTier } from "./GlbResourceBudget";
import { glbManager, starterCityWallHeadroom } from "./GLBModelManager";
import { releaseGlbTree } from "./GlbModelLease";

// Wall bytes are SHA-pinned and not stored in the repository: serve a small real
// fixture GLB under the pinned wall URL so the real decode/admission path runs.
const served = vi.hoisted(() => ({ bytes: null as ArrayBuffer | null }));
vi.mock("./GlbResourceBudget", async original => ({
  ...(await original<typeof import("./GlbResourceBudget")>()),
  fetchVerifiedGlb: vi.fn(async () => {
    if (!served.bytes) throw Error("GLB_HTTP");
    return served.bytes.slice(0);
  }),
}));

afterEach(() => {
  served.bytes = null;
  glbManager.setAuthoritativeCatalog([]);
  glbManager.trimIdle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MiB = 1024 * 1024;
const wallEntry = {
  assetId: `glb_${AURION_STARTER_CITY_WALL_LODS[0].sha256.slice(0, 48)}`,
  sha256: AURION_STARTER_CITY_WALL_LODS[0].sha256,
  storageUrl: `/api/assets/glb/${AURION_STARTER_CITY_WALL_LODS[0].sha256}.glb`,
  purpose: "world-environment", subcategory: "structure",
  lods: AURION_STARTER_CITY_WALL_LODS.map(lod => ({ level: lod.level, sha256: lod.sha256, bytes: lod.bytes,
    assetId: `glb_${lod.sha256.slice(0, 48)}`, storageUrl: `/api/assets/glb/${lod.sha256}.glb`,
    targetKey: null, normalization: { lod: { level: lod.level } } })),
} as unknown as GlbCatalogEntry;

/**
 * Production readback 2026-11-07 (runtime 5fc68dc3, catalog revision 62cdc30e…):
 * `inspectGlbAllocation` of the exact stored bytes of every model the browser
 * projection requests around the city origin (return stone, street lamp, houses,
 * fountain, nature and the admin-placed house), ordered by file size — the order
 * in which concurrent downloads typically finish. The wall is one of the largest.
 */
const ORIGIN_NEIGHBOURS = Object.freeze([
  { name: "rock L0", fileBytes: 314_892, decodedBytes: 1_431_940, textureBytes: 1_398_100 },
  { name: "plant L0", fileBytes: 401_200, decodedBytes: 1_416_580, textureBytes: 1_398_100 },
  { name: "house B L0", fileBytes: 1_044_832, decodedBytes: 4_536_012, textureBytes: 4_194_300 },
  { name: "tree L0", fileBytes: 1_116_224, decodedBytes: 4_607_916, textureBytes: 4_194_300 },
  { name: "fountain L0", fileBytes: 1_229_500, decodedBytes: 2_960_936, textureBytes: 2_796_200 },
  { name: "house C L0", fileBytes: 2_295_568, decodedBytes: 12_626_012, textureBytes: 12_582_908 },
  { name: "street lamp L1", fileBytes: 3_200_012, decodedBytes: 17_420_988, textureBytes: 16_777_212 },
  { name: "house A L1", fileBytes: 4_234_780, decodedBytes: 18_070_812, textureBytes: 16_777_212 },
  { name: "street lamp L0", fileBytes: 4_317_280, decodedBytes: 21_042_396, textureBytes: 16_777_212 },
  { name: "return stone L0", fileBytes: 7_954_128, decodedBytes: 67_333_644, textureBytes: 67_108_860 },
  { name: "house A L0", fileBytes: 12_978_996, decodedBytes: 71_581_644, textureBytes: 67_108_860 },
] as const);

type Arrival = Readonly<{ name: string; fileBytes: number; decodedBytes: number; textureBytes: number; wall: boolean }>;

function arrivals(tier: AssetTier): Arrival[] {
  const levels = tier === "phone" ? AURION_STARTER_CITY_WALL_LODS.slice(0, 1) : AURION_STARTER_CITY_WALL_LODS;
  return [
    ...ORIGIN_NEIGHBOURS.map(item => ({ ...item, wall: false })),
    ...levels.map(lod => ({ name: `wall L${lod.level}`, fileBytes: lod.bytes, decodedBytes: lod.decodedBytes, textureBytes: lod.textureBytes, wall: true })),
  ].sort((left, right) => left.fileBytes - right.fileBytes);
}

/** Admits models in arrival order through the real pool; returns which wall LODs were admitted. */
function admit(pool: GlbResourcePool, order: readonly Arrival[], holdWall: boolean) {
  const releaseHold = holdWall ? pool.holdHeadroom(AURION_STARTER_CITY_WALL_HEADROOM_KEY, starterCityWallHeadroom(wallEntry, pool.tier)!) : null;
  const admitted: string[] = [], rejected: string[] = [];
  for (const item of order) {
    const release = pool.reserve({ decodedBytes: item.decodedBytes, textureBytes: item.textureBytes, animations: 0 },
      item.wall ? AURION_STARTER_CITY_WALL_HEADROOM_KEY : undefined);
    (release ? admitted : rejected).push(item.name);
  }
  releaseHold?.();
  return { admitted, rejected, wallLods: admitted.filter(name => name.startsWith("wall")) };
}

describe("pinned city wall headroom", () => {
  it("pins the measured allocation of every wall LOD (88 MB of textures for the three LODs)", () => {
    expect(AURION_STARTER_CITY_WALL_LODS.reduce((sum, lod) => sum + lod.textureBytes, 0)).toBe(88_080_336);
    for (const lod of AURION_STARTER_CITY_WALL_LODS) expect(starterCityWallAllocation(lod.sha256)).toEqual({ decodedBytes: lod.decodedBytes, textureBytes: lod.textureBytes });
    expect(starterCityWallAllocation("f".repeat(64))).toBeNull();
  });

  it.each(["phone", "tablet", "desktop"] as const)("reserves exactly the admitted wall LODs on %s and fits every profile with room for scenery", tier => {
    const headroom = starterCityWallHeadroom(wallEntry, tier)!;
    const levels = tier === "phone" ? [0] : [0, 1, 2];
    const lods = AURION_STARTER_CITY_WALL_LODS.filter(lod => levels.includes(lod.level));
    expect(headroom).toEqual({ decodedBytes: lods.reduce((sum, lod) => sum + lod.decodedBytes, 0), textureBytes: lods.reduce((sum, lod) => sum + lod.textureBytes, 0) });
    // At most half of any device profile, so neighbouring scenery keeps a real budget.
    expect(headroom.decodedBytes).toBeLessThanOrEqual(assetBudgets[tier].decodedBytes / 2);
    expect(headroom.textureBytes).toBeLessThanOrEqual(assetBudgets[tier].textureBytes / 2);
    expect(starterCityWallHeadroom({ ...wallEntry, sha256: "f".repeat(64) } as GlbCatalogEntry, tier)).toBeNull();
  });

  // Root cause of "wall visible on PC, invisible on Android" (2026-11-07): admission
  // was first come, first served. On a phone the origin's visuals need ~237 MiB
  // decoded against 128 MiB; smaller downloads finished first and the wall was
  // rejected with GLB_DECODED_BUDGET on every retry. The desktop profile happened to fit.
  it("reproduces the production phone failure without a hold", () => {
    expect(admit(new GlbResourcePool("phone"), arrivals("phone"), false).wallLods).toEqual([]);
  });

  it.each(["phone", "tablet", "desktop"] as const)("always admits the whole wall family on %s whatever finishes downloading first", tier => {
    const base = arrivals(tier);
    const orders = [base, [...base].reverse(), [...base.filter(item => !item.wall), ...base.filter(item => item.wall)]];
    let seed = 7;
    for (let shuffle = 0; shuffle < 20; shuffle++) {
      const order = [...base];
      for (let index = order.length - 1; index > 0; index--) {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        const other = seed % (index + 1);
        [order[index], order[other]] = [order[other]!, order[index]!];
      }
      orders.push(order);
    }
    for (const order of orders) {
      const pool = new GlbResourcePool(tier);
      const result = admit(pool, order, true);
      expect(result.wallLods.sort()).toEqual(base.filter(item => item.wall).map(item => item.name).sort());
      // The hold never raises a ceiling: everything admitted still fits the profile.
      const evidence = pool.evidence();
      expect(evidence.reservedDecodedBytes).toBeLessThanOrEqual(assetBudgets[tier].decodedBytes);
      expect(evidence.reservedTextureBytes).toBeLessThanOrEqual(assetBudgets[tier].textureBytes);
    }
  });

  it("keeps a hold away from other models, draws it down per LOD and releases it once", () => {
    const pool = new GlbResourcePool("phone");
    const limit = pool.limits.textureBytes;
    const release = pool.holdHeadroom("wall", { decodedBytes: 30 * MiB, textureBytes: 30 * MiB });
    expect(() => pool.holdHeadroom("wall", { decodedBytes: 1, textureBytes: 1 })).toThrow("GLB_HEADROOM_HOLD_DUPLICATE");
    // Another model may use everything except the hold.
    expect(pool.reserve({ decodedBytes: 1, textureBytes: limit - 30 * MiB + 1, animations: 0 })).toBeNull();
    const other = pool.reserve({ decodedBytes: 1, textureBytes: limit - 30 * MiB, animations: 0 });
    expect(other).not.toBeNull();
    // The owner consumes its hold in parts (one reservation per physical LOD).
    expect(pool.reserve({ decodedBytes: 10 * MiB, textureBytes: 10 * MiB, animations: 0 }, "wall")).not.toBeNull();
    expect(pool.evidence().heldHeadroom).toEqual({ wall: { decodedBytes: 20 * MiB, textureBytes: 20 * MiB } });
    expect(pool.reserve({ decodedBytes: 20 * MiB, textureBytes: 20 * MiB, animations: 0 }, "wall")).not.toBeNull();
    expect(pool.reserve({ decodedBytes: 1, textureBytes: 1, animations: 0 }, "wall")).toBeNull();
    release();
    release();
    expect(pool.evidence().heldHeadroom).toEqual({});
    other!();
    expect(pool.reserve({ decodedBytes: 1, textureBytes: 1, animations: 0 })).not.toBeNull();
  });

  // Review (Devin on 356f0330): a failed wall decode released its reservation
  // into the free pool, so another model could take what the wall was promised.
  it("returns a failed owner reservation to its still-active hold, not to other models", () => {
    const pool = new GlbResourcePool("phone");
    const limit = pool.limits.textureBytes;
    const releaseHold = pool.holdHeadroom("wall", { decodedBytes: 30 * MiB, textureBytes: 30 * MiB });
    const filler = pool.reserve({ decodedBytes: 1, textureBytes: limit - 30 * MiB, animations: 0 });
    const lod0 = pool.reserve({ decodedBytes: 10 * MiB, textureBytes: 10 * MiB, animations: 0 }, "wall");
    expect(lod0).not.toBeNull();
    lod0!(); // decode failed
    expect(pool.evidence().heldHeadroom).toEqual({ wall: { decodedBytes: 30 * MiB, textureBytes: 30 * MiB } });
    expect(pool.reserve({ decodedBytes: 1, textureBytes: 10 * MiB, animations: 0 })).toBeNull();
    // The wall's retry still gets the whole family.
    expect(pool.reserve({ decodedBytes: 30 * MiB, textureBytes: 30 * MiB, animations: 0 }, "wall")).not.toBeNull();
    releaseHold();
    filler!();
  });

  it("does not refill a hold that was released before the reservation", () => {
    const pool = new GlbResourcePool("phone");
    const releaseHold = pool.holdHeadroom("wall", { decodedBytes: 30 * MiB, textureBytes: 30 * MiB });
    const lod0 = pool.reserve({ decodedBytes: 10 * MiB, textureBytes: 10 * MiB, animations: 0 }, "wall");
    releaseHold();
    lod0!();
    expect(pool.evidence().heldHeadroom).toEqual({});
    expect(pool.evidence().reservedTextureBytes).toBe(0);
  });

  it("decodes the pinned wall URL from its hold when other models filled the rest of the budget", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fixture = testGlb("Aurion_CityWall_LOD0");
    const plan = await buildGlbImportPlan(fixture.toString("base64"), "world-environment", "Aurion_CityWall_LOD0.glb");
    served.bytes = Uint8Array.from(fixture).buffer;
    const wall = AURION_STARTER_CITY_WALL_LODS[0];
    const url = `/api/assets/glb/${wall.sha256}.glb`;
    const normalization = { ...plan.normalization, sourceSha256: wall.sha256 };
    expect(glbResourcePool.tier).toBe("phone");
    const releaseHold = glbResourcePool.holdHeadroom(AURION_STARTER_CITY_WALL_HEADROOM_KEY, starterCityWallHeadroom(wallEntry)!);
    const limits = glbResourcePool.limits;
    const filler = glbResourcePool.reserve({ decodedBytes: limits.decodedBytes - wall.decodedBytes, textureBytes: limits.textureBytes - wall.textureBytes, animations: 0 });
    expect(filler).not.toBeNull();
    let loaded: THREE.Group | undefined;
    try {
      loaded = (await glbManager.loadModel(url, normalization)).scene;
      expect(new THREE.Box3().setFromObject(loaded).isEmpty()).toBe(false);
      // An ordinary model gets nothing from the wall's remaining hold.
      expect(glbResourcePool.reserve({ decodedBytes: 1, textureBytes: 1, animations: 0 })).toBeNull();
    } finally {
      if (loaded) releaseGlbTree(loaded);
      filler!();
      releaseHold();
    }
  });
});
