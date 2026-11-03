import { describe, expect, it } from "vitest";
import { STARTER_CITY_WALL_PLACEMENT, requireStarterCityWallReadback } from "./starterCityWallPublication";

const design = () => ({ designKey: "starter-city-wall", version: 1, title: "Starter city wall",
  designHash: "a".repeat(64), expectedCatalogRevision: "b".repeat(64), placements: [{ ...STARTER_CITY_WALL_PLACEMENT }] });
const world = (designs: unknown[]) => ({ schemaVersion: "aurion.world-design.v1", revision: "c".repeat(64), designs });

describe("starter city wall publication readback", () => {
  it("accepts one exact wall among unrelated published designs", () => {
    expect(requireStarterCityWallReadback(world([{ ...design(), designKey: "other-design" }, design()]))).toEqual(design());
  });
  it("rejects missing, duplicate, replaced and unplaced walls", () => {
    for (const designs of [[], [design(), design()], [{ ...design(), version: 2 }], [{ ...design(), placements: [] }],
      [{ ...design(), placements: [STARTER_CITY_WALL_PLACEMENT, { ...STARTER_CITY_WALL_PLACEMENT, placementKey: "other" }] }]]) {
      expect(() => requireStarterCityWallReadback(world(designs))).toThrow();
    }
  });
  it.each([
    ["assetId", "glb_another"], ["placementKey", "other-wall"], ["chunkX", 1], ["chunkZ", 1],
    ["xMm", 32001], ["zMm", 32001], ["rotationQuarterTurns", 1], ["scalePermille", 500],
  ])("rejects a changed %s instead of reporting successful publication", (key, value) => {
    const changed = { ...design(), placements: [{ ...STARTER_CITY_WALL_PLACEMENT, [key]: value }] };
    expect(() => requireStarterCityWallReadback(world([changed]))).toThrow("CITY_WALL_DESIGN_READBACK_MISMATCH");
  });
});
