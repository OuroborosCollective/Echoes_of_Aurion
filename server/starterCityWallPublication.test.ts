import { describe, expect, it, vi } from "vitest";
import { AURION_STARTER_CITY_WALL_LODS } from "../shared/aurionStarterCityWallContract";
import { STARTER_CITY_WALL_PLACEMENT, requireStarterCityWallReadback, requireStarterCityWallStoredAssets } from "./starterCityWallPublication";

const design = () => ({ designKey: "starter-city-wall", version: 1, title: "Starter city wall",
  designHash: "a".repeat(64), expectedCatalogRevision: "b".repeat(64), placements: [{ ...STARTER_CITY_WALL_PLACEMENT }] });
const world = (designs: unknown[]) => ({ schemaVersion: "aurion.world-design.v1", revision: "c".repeat(64), designs });

describe("starter city wall publication readback", () => {
  it("reads every pinned LOD through the approved storage boundary", async () => {
    const approvedBytes = vi.fn(async (sha256: string) => {
      const lod = AURION_STARTER_CITY_WALL_LODS.find(item => item.sha256 === sha256)!;
      return Buffer.alloc(lod.bytes);
    });
    expect(await requireStarterCityWallStoredAssets({ approvedBytes })).toEqual(
      AURION_STARTER_CITY_WALL_LODS.map(({ level, sha256, bytes }) => ({ level, sha256, bytes })),
    );
    expect(approvedBytes.mock.calls.map(([sha256]) => sha256)).toEqual(AURION_STARTER_CITY_WALL_LODS.map(lod => lod.sha256));
  });
  it.each(AURION_STARTER_CITY_WALL_LODS)("rejects an unavailable approved LOD $level", async missing => {
    const approvedBytes = async (sha256: string) => sha256 === missing.sha256 ? null
      : Buffer.alloc(AURION_STARTER_CITY_WALL_LODS.find(lod => lod.sha256 === sha256)!.bytes);
    await expect(requireStarterCityWallStoredAssets({ approvedBytes })).rejects.toThrow("CITY_WALL_STORED_GLB_UNAVAILABLE");
  });
  it.each(["ENOENT", "GLB_STORED_DIGEST_MISMATCH"])("propagates a stored-file failure: %s", async message => {
    const failure = new Error(message);
    await expect(requireStarterCityWallStoredAssets({ approvedBytes: async () => { throw failure; } })).rejects.toBe(failure);
  });
  it("rejects bytes that do not match the pinned size", async () => {
    await expect(requireStarterCityWallStoredAssets({ approvedBytes: async () => Buffer.alloc(12) })).rejects.toThrow("CITY_WALL_STORED_GLB_SIZE_MISMATCH");
  });
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
