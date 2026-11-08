import { describe, expect, it } from "vitest";
import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "../shared/aurionStarterCityWallContract";
import { intersectsStarterCityWallClearance, STARTER_CITY_PROCEDURAL_CLEARANCE_MM, worldAssetById, worldAssetCatalog, worldAssetsForChunk, type WorldAsset } from "../shared/worldAssetProtocol";

/**
 * Exact source-catalog LOD envelopes, not a made-up fixed house size.
 * A city placement is unsafe if any approved LOD touches the published
 * 110 x 110 m city-wall envelope plus a 6 m construction clearance.
 */
function intersectsStarterWall(placement: ReturnType<typeof worldAssetsForChunk>[number]): boolean {
  const asset = worldAssetById.get(placement.assetId);
  if (!asset) throw new Error("WORLD_ASSET_CATALOG_MISSING");
  if (asset.family !== "city") return false;
  const halfX = Math.ceil(Math.max(...asset.lods.map(lod =>
    lod.bounds.max[0] - lod.bounds.min[0])) * asset.scale * 500);
  const halfZ = Math.ceil(Math.max(...asset.lods.map(lod =>
    lod.bounds.max[2] - lod.bounds.min[2])) * asset.scale * 500);
  const xHalf = placement.rotation % 2 === 0 ? halfX : halfZ;
  const zHalf = placement.rotation % 2 === 0 ? halfZ : halfX;
  const clearanceMm = 6_000;
  return Math.abs(placement.xMm) - xHalf < AURION_STARTER_CITY_WALL_ENVELOPE_MM[0] / 2 + clearanceMm
    && Math.abs(placement.zMm) - zHalf < AURION_STARTER_CITY_WALL_ENVELOPE_MM[2] / 2 + clearanceMm;
}

describe("Issue #659: no procedural structures through the published starter-city wall", () => {
  it("never places generic city GLBs inside or through the wall clearance across nearby chunks", () => {
    for (const seed of ["echoes-of-aurion-v1", "seed-a", "seed-b"]) {
      for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
        if (x === 0 && z === 0) continue; // authored starter-village markers stay under their separate contract
        for (const placement of worldAssetsForChunk(seed, { x, z })) {
          expect(intersectsStarterWall(placement), `${seed} chunk(${x},${z}) ${placement.id} ${placement.assetId}`).toBe(false);
        }
      }
    }
  });

  it("retains stable exterior city/nature generation and preserves exact authored village", () => {
    for (const seed of ["seed-a", "seed-b"]) {
      for (const coordinate of [{ x: 6, z: 0 }, { x: -6, z: -6 }, { x: 24, z: 24 }]) {
        expect(worldAssetsForChunk(seed, coordinate)).toHaveLength(12);
        expect(worldAssetsForChunk(seed, coordinate)).toEqual(worldAssetsForChunk(seed, coordinate));
      }
    }
    // All 112 nature assets carry existing game-authoritative colliders. A visual
    // clean-up must not silently remove them and change movement/replay outcomes.
    const adjacentNature = worldAssetsForChunk("seed-a", { x: -1, z: 0 });
    expect(adjacentNature).toHaveLength(12);
    expect(adjacentNature.every(p => worldAssetById.get(p.assetId)?.family === "nature")).toBe(true);
    const village = worldAssetsForChunk("seed-a", { x: 0, z: 0 });
    expect(village).toHaveLength(10);
    expect(worldAssetsForChunk("seed-b", { x: 0, z: 0 })).toEqual(village);
  });
});

/** Synthetic rectangular geometry gives independent, exact millimetre boundaries. */
function rectangularAsset(width = 4, depth = 12, scale = 1): WorldAsset {
  const template = worldAssetCatalog.assets.find(asset => asset.family === "city")!;
  return {
    ...template,
    scale,
    lods: [{
      ...template.lods[0]!,
      bounds: { min: [-width / 2, 0, -depth / 2], max: [width / 2, 10, depth / 2] },
    }],
  };
}

describe("starter-city clearance geometry", () => {
  it("reserves the published 110 m wall footprint with 6 m clearance", () => {
    expect(AURION_STARTER_CITY_WALL_ENVELOPE_MM).toEqual([110_000, 20_000, 110_000]);
    expect(STARTER_CITY_PROCEDURAL_CLEARANCE_MM).toBe(6_000);
    const asset = rectangularAsset();
    expect(intersectsStarterCityWallClearance(asset, { xMm: 0, zMm: 0, rotation: 0 })).toBe(true);
    // Outside the wall itself, but still inside its construction clearance.
    expect(intersectsStarterCityWallClearance(asset, { xMm: 60_000, zMm: 0, rotation: 0 })).toBe(true);
  });

  for (const rotation of [0, 1, 2, 3]) {
    for (const axis of ["xMm", "zMm"] as const) {
      for (const sign of [-1, 1]) {
        it(`checks the ${sign > 0 ? "positive" : "negative"} ${axis} boundary at rotation ${rotation}`, () => {
          const asset = rectangularAsset();
          // A 4 x 12 m rectangle reaches 2/6 m from its centre, swapped at 90/270 degrees.
          const extent = axis === "xMm"
            ? ([2_000, 6_000, 2_000, 6_000][rotation]!)
            : ([6_000, 2_000, 6_000, 2_000][rotation]!);
          const boundary = 61_000 + extent;
          const placement = { xMm: 0, zMm: 0, rotation };
          expect(intersectsStarterCityWallClearance(asset, { ...placement, [axis]: sign * (boundary - 1) })).toBe(true);
          // Exact contact is admitted by the strict overlap predicate.
          expect(intersectsStarterCityWallClearance(asset, { ...placement, [axis]: sign * boundary })).toBe(false);
          expect(intersectsStarterCityWallClearance(asset, { ...placement, [axis]: sign * (boundary + 1) })).toBe(false);
        });
      }
    }
  }

  it.each([-1, 1])("requires overlap on both axes at corner sign %i", sign => {
    const asset = rectangularAsset();
    expect(intersectsStarterCityWallClearance(asset, { xMm: sign * 62_999, zMm: sign * 66_999, rotation: 0 })).toBe(true);
    expect(intersectsStarterCityWallClearance(asset, { xMm: sign * 63_000, zMm: sign * 66_999, rotation: 0 })).toBe(false);
    expect(intersectsStarterCityWallClearance(asset, { xMm: sign * 62_999, zMm: sign * 67_000, rotation: 0 })).toBe(false);
  });

  it("applies catalog scale before rounding each half extent up to integer millimetres", () => {
    // 3 m * 0.333 scale / 2 = 499.5 mm; the conservative half extent is 500 mm.
    const asset = rectangularAsset(3, 3, 0.333);
    expect(intersectsStarterCityWallClearance(asset, { xMm: 61_499, zMm: 0, rotation: 0 })).toBe(true);
    expect(intersectsStarterCityWallClearance(asset, { xMm: 61_500, zMm: 0, rotation: 0 })).toBe(false);
    expect(intersectsStarterCityWallClearance(asset, { xMm: 0, zMm: 61_499, rotation: 0 })).toBe(true);
    expect(intersectsStarterCityWallClearance(asset, { xMm: 0, zMm: 61_500, rotation: 0 })).toBe(false);
  });

  it("uses the widest X and Z bounds across all LODs independently of their order", () => {
    const asset = rectangularAsset(2, 2);
    // Different LODs supply the widest X and widest Z. Bounds need not be centred.
    asset.lods.push(
      { ...asset.lods[0]!, bounds: { min: [10, 0, 20], max: [30, 1, 22] } },
      { ...asset.lods[0]!, bounds: { min: [-3, 0, -40], max: [-1, 1, -10] } },
    );
    for (const lods of [asset.lods, [...asset.lods].reverse()]) {
      const model = { ...asset, lods };
      expect(intersectsStarterCityWallClearance(model, { xMm: 70_999, zMm: 75_999, rotation: 0 })).toBe(true);
      expect(intersectsStarterCityWallClearance(model, { xMm: 71_000, zMm: 0, rotation: 0 })).toBe(false);
      expect(intersectsStarterCityWallClearance(model, { xMm: 0, zMm: 76_000, rotation: 0 })).toBe(false);
      expect(intersectsStarterCityWallClearance(model, { xMm: 75_999, zMm: 70_999, rotation: 1 })).toBe(true);
    }
  });

  it("keeps nature colliders even when their geometry overlaps the clearance", () => {
    const placements = worldAssetsForChunk("seed-a", { x: -1, z: 0 });
    const overlapping = placements.filter(placement =>
      intersectsStarterCityWallClearance(worldAssetById.get(placement.assetId)!, placement));
    expect(overlapping.length).toBeGreaterThan(0);
    expect(overlapping.every(placement => worldAssetById.get(placement.assetId)?.family === "nature")).toBe(true);
    expect(placements).toHaveLength(12);
  });
});
