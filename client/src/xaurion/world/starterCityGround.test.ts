import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AX1_INITIAL_RESOURCE_NODES } from "@shared/ax1ResourceEcologyProtocol";
import { AURION_STARTER_CITY_WALL_ENVELOPE_MM } from "@shared/aurionStarterCityWallContract";
import { STARTER_CITY_PROCEDURAL_CLEARANCE_MM } from "@shared/worldAssetProtocol";
import { ORE_OUTCROP_HEIGHT_M, ORE_OUTCROP_RADIUS_M, oreOutcropHeightM, oreOutcropSites } from "./oreOutcrop";
import { STARTER_CITY_FLAT_HALF_EXTENT_M, STARTER_CITY_GROUND_BLEND_M, starterCityGroundFactor, touchesStarterCityGround } from "./starterCityGround";
import { WorldChunkManager } from "./WorldChunkManager";

const WALL_HALF_M = AURION_STARTER_CITY_WALL_ENVELOPE_MM[0] / 2000;

describe("starter city ground envelope (owner design brief 2026-11-10)", () => {
  it("covers the whole area inside the city walls and equals the procedural clearance square", () => {
    expect(STARTER_CITY_FLAT_HALF_EXTENT_M).toBeGreaterThanOrEqual(WALL_HALF_M);
    for (const [x, z] of [[0, 0], [WALL_HALF_M, WALL_HALF_M], [-WALL_HALF_M, 12], [30, -WALL_HALF_M], [60.9, -60.9]] as const) {
      expect(starterCityGroundFactor(x, z)).toBe(0);
      expect(touchesStarterCityGround(x, z)).toBe(true);
    }
    // Same square as the Aurion placement plan keeps free of procedural models.
    expect(STARTER_CITY_FLAT_HALF_EXTENT_M * 1000).toBe(AURION_STARTER_CITY_WALL_ENVELOPE_MM[0] / 2 + STARTER_CITY_PROCEDURAL_CLEARANCE_MM);
    expect(touchesStarterCityGround(STARTER_CITY_FLAT_HALF_EXTENT_M, 0)).toBe(false);
    expect(touchesStarterCityGround(STARTER_CITY_FLAT_HALF_EXTENT_M + 2, 0, 2.5)).toBe(true);
  });

  it("blends monotonically to natural terrain outside the walls", () => {
    let previous = 0;
    for (let d = STARTER_CITY_FLAT_HALF_EXTENT_M; d <= STARTER_CITY_FLAT_HALF_EXTENT_M + STARTER_CITY_GROUND_BLEND_M + 5; d += 0.5) {
      const factor = starterCityGroundFactor(d, 3);
      expect(factor).toBeGreaterThanOrEqual(previous);
      expect(starterCityGroundFactor(-3, -d)).toBe(factor);
      previous = factor;
    }
    expect(previous).toBe(1);
  });
});

describe("presentation ground query", () => {
  const manager = new WorldChunkManager(new THREE.Scene());

  it("is one flat plane inside the city walls, away from ore outcrops", () => {
    for (let x = -WALL_HALF_M; x <= WALL_HALF_M; x += 5) for (let z = -WALL_HALF_M; z <= WALL_HALF_M; z += 5) {
      if (oreOutcropHeightM(x, z) > 0) continue;
      expect(manager.getElevationAt(x, z)).toBe(0);
    }
    expect(manager.getElevationAt(140, 140)).not.toBe(0);
  });

  it("raises the ground under every ore vein above all of its surroundings", () => {
    const ores = AX1_INITIAL_RESOURCE_NODES.filter(node => node.nodeKind === "ore");
    expect(oreOutcropSites().map(site => site.nodeId)).toEqual(ores.map(node => node.id));
    for (const ore of ores) {
      const x = ore.xFixed / 1000, z = ore.zFixed / 1000;
      const crown = manager.getElevationAt(x, z);
      for (let step = 0; step < 16; step++) {
        const angle = step / 16 * Math.PI * 2;
        const rim = manager.getElevationAt(x + Math.cos(angle) * ORE_OUTCROP_RADIUS_M, z + Math.sin(angle) * ORE_OUTCROP_RADIUS_M);
        expect(crown - rim).toBeCloseTo(ORE_OUTCROP_HEIGHT_M, 6);
        const slope = manager.getElevationAt(x + Math.cos(angle) * ORE_OUTCROP_RADIUS_M / 2, z + Math.sin(angle) * ORE_OUTCROP_RADIUS_M / 2);
        expect(slope).toBeLessThan(crown);
        expect(slope).toBeGreaterThan(rim);
      }
    }
    // Other resource kinds (plants, carcasses) get no outcrop.
    for (const node of AX1_INITIAL_RESOURCE_NODES.filter(entry => entry.nodeKind !== "ore")) {
      expect(oreOutcropHeightM(node.xFixed / 1000, node.zFixed / 1000)).toBe(0);
    }
  });
});
