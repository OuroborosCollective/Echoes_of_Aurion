import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AURION_STARTER_CITY_WALL_LODS, isStarterCityWallSource, starterCityWallAssetId } from "./aurionStarterCityWallContract";

describe("starter city wall identity", () => {
  it("keeps native and browser identities in parity and rejects unapproved bytes", () => {
    const native = readFileSync("godot-client/world/world_design_projection.gd", "utf8");
    const block = native.split("const STARTER_CITY_WALL_HASHES := [")[1]!.split("]")[0]!;
    expect([...block.matchAll(/"([a-f0-9]{64})"/g)].map(match => match[1]))
      .toEqual(AURION_STARTER_CITY_WALL_LODS.map(lod => lod.sha256));
    for (const lod of AURION_STARTER_CITY_WALL_LODS) {
      expect(isStarterCityWallSource(lod.sha256)).toBe(true);
      expect(starterCityWallAssetId(lod.sha256)).toBe(`glb_${lod.sha256.slice(0, 48)}`);
    }
    expect(isStarterCityWallSource("Aurion_CityWall_LOD0.glb")).toBe(false);
    expect(isStarterCityWallSource("f".repeat(64))).toBe(false);
    expect(() => starterCityWallAssetId("f".repeat(64))).toThrow("STARTER_CITY_WALL_SOURCE_UNKNOWN");
  });
});
