import { describe, expect, it } from "vitest";
import {
  AURION_STARTER_VILLAGE_ASSET_PLACEMENTS,
  AURION_STARTER_VILLAGE_CENTER_MM,
  AURION_STARTER_VILLAGE_GATES,
  AURION_STARTER_VILLAGE_MAIN_AXES,
  AURION_STARTER_VILLAGE_RING_ROAD,
  AURION_STARTER_VILLAGE_SPAWN_MM,
  AURION_STARTER_VILLAGE_WALL_PLAN,
  assertStarterVillageWallPlan,
} from "../shared/aurionStarterVillageContract";
import { AURION_RETURN_STONE_POSITION } from "../shared/aurionReturnStoneContract";
import catalog from "../shared/worldAssetCatalog.json";
import { worldAssetsForChunk } from "../shared/worldAssetProtocol";

describe("Aurion starter village layout contract", () => {
  it("keeps the established spawn and return stone at the same referenced position", () => {
    expect(AURION_STARTER_VILLAGE_SPAWN_MM).toBe(AURION_RETURN_STONE_POSITION);
    expect(AURION_STARTER_VILLAGE_SPAWN_MM).toEqual({ x: 0, z: 8_000 });
  });

  it("defines exactly four directional gate anchors including the pilot north gate", () => {
    expect(AURION_STARTER_VILLAGE_GATES).toHaveLength(4);
    expect(
      AURION_STARTER_VILLAGE_GATES.map(gate => gate.direction).sort()
    ).toEqual(["east", "north", "south", "west"]);
    expect(AURION_STARTER_VILLAGE_GATES.filter(gate => gate.pilot)).toEqual([
      expect.objectContaining({
        direction: "north",
        position: { x: 0, z: -30_000 },
      }),
    ]);
  });

  it("keeps a direct main-axis route from the centre to the north gate", () => {
    const northGate = AURION_STARTER_VILLAGE_GATES.find(
      gate => gate.direction === "north"
    )!;
    const northAxis = AURION_STARTER_VILLAGE_MAIN_AXES.find(
      axis => axis.direction === "north"
    )!;
    expect(northAxis).toMatchObject({
      from: AURION_STARTER_VILLAGE_CENTER_MM,
      to: northGate.position,
      widthMm: 6_000,
    });
    const blockers = AURION_STARTER_VILLAGE_ASSET_PLACEMENTS.filter(
      placement =>
        placement.id !== northGate.id &&
        Math.abs(placement.xMm) < northAxis.widthMm / 2 &&
        placement.zMm <= 0 &&
        placement.zMm >= northGate.position.z
    );
    expect(blockers).toEqual([]);
  });

  it("rejects closed walls even when callers declare four open IDs without geometry", () => {
    expect(AURION_STARTER_VILLAGE_WALL_PLAN.presentation).toBe("partial-set");
    expect(() =>
      assertStarterVillageWallPlan({
        presentation: "closed",
        geometricallyOpenGateIds: AURION_STARTER_VILLAGE_GATES.slice(0, 3).map(
          gate => gate.id
        ),
      })
    ).toThrow("STARTER_VILLAGE_CLOSED_WALL_REQUIRES_GEOMETRIC_EVIDENCE");
    expect(() =>
      assertStarterVillageWallPlan({
        presentation: "closed",
        geometricallyOpenGateIds: AURION_STARTER_VILLAGE_GATES.map(
          gate => gate.id
        ),
      })
    ).toThrow("STARTER_VILLAGE_CLOSED_WALL_REQUIRES_GEOMETRIC_EVIDENCE");
  });

  it("reserves the full ring corridor and cardinal axes using rendered asset bounds", () => {
    const outerRadius = AURION_STARTER_VILLAGE_RING_ROAD.radiusMm +
      AURION_STARTER_VILLAGE_RING_ROAD.widthMm / 2;
    for (const placement of AURION_STARTER_VILLAGE_ASSET_PLACEMENTS) {
      const asset = catalog.assets.find(asset => asset.id === placement.assetId)!;
      // Same centered bounds, scale and quarter turns as WorldAssetProjection.
      // Union all LOD bounds so switching LOD cannot enter the reserved path.
      const anchorX = (asset.bounds.min[0] + asset.bounds.max[0]) / 2;
      const anchorZ = (asset.bounds.min[2] + asset.bounds.max[2]) / 2;
      const halfX = Math.ceil(Math.max(...asset.lods.flatMap(lod =>
        [Math.abs(lod.bounds.min[0] - anchorX), Math.abs(lod.bounds.max[0] - anchorX)])) * asset.scale * 1000);
      const halfZ = Math.ceil(Math.max(...asset.lods.flatMap(lod =>
        [Math.abs(lod.bounds.min[2] - anchorZ), Math.abs(lod.bounds.max[2] - anchorZ)])) * asset.scale * 1000);
      const hx = placement.rotation % 2 ? halfZ : halfX;
      const hz = placement.rotation % 2 ? halfX : halfZ;
      const nearX = Math.max(0, Math.abs(placement.xMm) - hx);
      const nearZ = Math.max(0, Math.abs(placement.zMm) - hz);
      expect(nearX * nearX + nearZ * nearZ, placement.id).toBeGreaterThan(outerRadius * outerRadius);
      if (!AURION_STARTER_VILLAGE_GATES.some(gate => gate.id === placement.id)) {
        expect(nearX, placement.id).toBeGreaterThan(3_000);
        expect(nearZ, placement.id).toBeGreaterThan(3_000);
      }
    }
  });

  it("projects the fixed layout independent of seed and only with catalog asset IDs", () => {
    const first = worldAssetsForChunk("seed-a", { x: 0, z: 0 });
    expect(worldAssetsForChunk("seed-b", { x: 0, z: 0 })).toEqual(first);
    expect(first).toHaveLength(AURION_STARTER_VILLAGE_ASSET_PLACEMENTS.length);
    const ids = new Set(catalog.assets.map(asset => asset.id));
    expect(first.every(placement => ids.has(placement.assetId))).toBe(true);
  });
});
