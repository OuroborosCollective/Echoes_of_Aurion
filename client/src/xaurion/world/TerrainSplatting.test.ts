import { describe, expect, it } from "vitest";
import { calculateSplatWeights, resolveWeightsFromDescriptor, TerrainSplatDescriptor } from "./TerrainSplatting";
import { WorldChunkData } from "../types";

function createMockChunk(overrides: Partial<WorldChunkData> = {}): WorldChunkData {
  return {
    chunkKey: "0,0",
    chunkX: 0,
    chunkZ: 0,
    centerX: 0,
    centerZ: 0,
    size: 80,
    biome: "whispering_forest",
    kingdom: "Königreich Aurion-Hochland",
    landmarkType: "forest",
    landmarkName: "",
    elevationBase: 0,
    materialTheme: "grass",
    obstacles: [],
    featureDescription: "",
    createdAt: "",
    ...overrides
  };
}

describe("Terrain Splatting determinism and stability (AIM-275)", () => {
  it("generates exact identical weights for identical terrain coordinates (no randomness)", () => {
    const chunk = createMockChunk();
    const w1 = calculateSplatWeights(10.5, 20.3, chunk);
    const w2 = calculateSplatWeights(10.5, 20.3, chunk);
    expect(w1).toEqual(w2);
  });

  it("normalizes weights and keeps them within finite [0, 1] bounds", () => {
    const desc: TerrainSplatDescriptor = {
      version: 1,
      height: 10,
      slope: 0.5,
      isPaved: true,
      isSnowy: true
    };
    
    // With high height, high slope, and paving, the unnormalized sum would exceed 1.0.
    const [rock, paving, snow, _a] = resolveWeightsFromDescriptor(desc);
    
    expect(rock).toBeGreaterThanOrEqual(0);
    expect(paving).toBeGreaterThanOrEqual(0);
    expect(snow).toBeGreaterThanOrEqual(0);
    
    const sum = rock + paving + snow;
    expect(sum).toBeLessThanOrEqual(1.000001);
    expect(Number.isFinite(rock)).toBe(true);
  });

  it("reproduces height and slope thresholds exactly", () => {
    const chunk = createMockChunk({ kingdom: "Grenzmark Frostkrone", elevationBase: 0 });
    
    // Force a position that has a slope of ~0 (a peak of the sine wave).
    // sin(x * 0.08) peaks at x * 0.08 = PI/2 => x = ~19.635
    const flatX = Math.PI / 2 / 0.08;
    const weightsFlat = calculateSplatWeights(flatX, 0, chunk); 
    
    // Flat terrain (slope ~0) should have rock = 0
    expect(weightsFlat[0]).toBe(0);
    
    // In Frostkrone kingdom (isSnowy = true), low height (e.g. 1.8 at peak) -> 1.0 snow based on rules
    expect(weightsFlat[2]).toBe(1.0);
  });

  it("yields identical seam-stable weights across neighbor chunks at their exact boundary", () => {
    const c1 = createMockChunk({ chunkX: 0, chunkZ: 0, centerX: 0, centerZ: 0, elevationBase: 2.0 });
    const c2 = createMockChunk({ chunkX: 1, chunkZ: 0, centerX: 80, centerZ: 0, elevationBase: 2.0 });
    
    // Position on the edge X=40
    const w1 = calculateSplatWeights(40, 0, c1);
    const w2 = calculateSplatWeights(40, 0, c2);
    
    expect(w1).toEqual(w2);
  });

  it("applies paving masks deterministically based on landmark proximity", () => {
    const cityChunk = createMockChunk({ landmarkType: 'city', centerX: 100, centerZ: 100 });
    
    // Right at the center of the city -> heavily paved
    const centerWeights = calculateSplatWeights(100, 100, cityChunk);
    // Paving should absolutely override everything else if isPaved is true
    expect(centerWeights[1]).toBe(1.0); // paving weight
    expect(centerWeights[0]).toBe(0.0); // no rock
    
    // Outside the 18.0 radius plaza -> not paved
    const farWeights = calculateSplatWeights(120, 100, cityChunk);
    expect(farWeights[1]).toBe(0.0);
  });
});
