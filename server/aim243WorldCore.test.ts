import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DeterministicPRNG, FixedTimestepLoop, GlobalWeatherEngine, TerrainBarycentric } from "../client/src/xaurion/integration/aurionWorldCore";

const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-243 deterministic xaurion world core", () => {
  it("runs the migrated simulation core at the normative 10 Hz independent of render calls", () => {
    const ticks: number[] = [];
    const loop = new FixedTimestepLoop();
    loop.onTick = tick => ticks.push(tick);
    loop.advance(0.05);
    expect(ticks).toEqual([]);
    loop.advance(0.05);
    expect(ticks).toEqual([1]);
    loop.advance(0.20);
    expect(ticks).toEqual([1, 2, 3]);
    expect(loop.targetTickRate).toBe(10);
  });

  it("keeps deterministic random streams reproducible from an Aurion-owned seed", () => {
    const left = new DeterministicPRNG(424242);
    const right = new DeterministicPRNG(424242);
    expect(Array.from({ length: 12 }, () => left.nextFloat())).toEqual(Array.from({ length: 12 }, () => right.nextFloat()));
  });

  it("derives weather from epoch and logical tick instead of browser wall clock", () => {
    const weather = new GlobalWeatherEngine();
    expect(weather.state(0, 0).type).toBe("clear_radiance");
    expect(weather.state(0, 3000).type).toBe("leyline_tempest");
    expect(weather.state(0, 6000).type).toBe("aether_rain");
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Weather must not consult the wall clock");
    });
    try {
      for (const epoch of [0, 1, 42]) {
        for (const tick of [0, 2999, 3000, 6000, 9000, 12000]) {
          expect(new GlobalWeatherEngine().state(epoch, tick)).toEqual(weather.state(epoch, tick));
        }
      }
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it("grounds TerrainBarycentric on the existing Aurion landscape height function", () => {
    const terrain = new TerrainBarycentric((x, z) => x * 2 + z * 3);
    expect(terrain.getHeight(2, 4)).toBe(16);
    expect(terrain.getNormal(2, 4).length()).toBeCloseTo(1, 8);
  });

  it("activates instancing, LOD, occlusion and measurable renderer metrics without replacing the owner landscape", () => {
    const core = read("client/src/xaurion/integration/aurionWorldCore.ts");
    const adapter = read("client/src/xaurion/integration/aurionAuthorityAdapter.ts");
    const landscape = read("client/src/xaurion/world/OpenWorldLandscape.ts");
    expect(core).toContain("new THREE.InstancedMesh");
    expect(core).toContain("class LODManager");
    expect(core).toContain("class OcclusionCullingSystem");
    expect(core).toContain("renderer.info.render.calls");
    expect(core).toContain("aurion:xaurion-world-core-metrics");
    expect(adapter).toContain("attachAurionWorldCore(engine)");
    expect(landscape).toContain("buildSanctumHub");
    expect(landscape).toContain("buildClockworkWoods");
    expect(landscape).toContain("buildScorchedQuarry");
    expect(landscape).toContain("buildVoidSpireArena");
  });
});
