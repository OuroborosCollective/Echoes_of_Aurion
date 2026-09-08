import { describe, expect, it } from "vitest";
import {
  classifyWorldChunkInterest,
  planWorldChunkInterest,
  worldChunkInterestBudget,
  worldChunkPresentationMode,
  worldChunkSimulationDemand,
} from "../shared/worldChunkInterestProtocol";
import { worldChunkCoordinateKey } from "../shared/worldChunkStreamingProtocol";

describe("AIM-289 world chunk interest rings", () => {
  it("keeps mobile as one active chunk plus eight preload chunks without inventing a far HLOD band", () => {
    for (const tier of ["phone", "tablet"] as const) {
      const plan = planWorldChunkInterest({ center: { x: 0, z: 0 }, tier, cached: [] });
      expect(worldChunkInterestBudget(tier)).toMatchObject({ activeRadius: 0, preloadRadius: 1, farRadius: 1 });
      expect(plan.active).toHaveLength(1);
      expect(plan.preload).toHaveLength(8);
      expect(plan.far).toHaveLength(0);
      expect(plan.active[0]).toMatchObject({ coordinate: { x: 0, z: 0 }, presentation: "full", simulationDemand: "confirmed-active-only" });
      expect(plan.preload.every(entry => entry.presentation === "prepared" && entry.simulationDemand === "none")).toBe(true);
    }
  });

  it("uses the desktop outer 5×5 ring as HLOD while keeping only the center simulation-demanding", () => {
    const plan = planWorldChunkInterest({ center: { x: 4, z: -3 }, tier: "desktop", cached: [] });
    expect(worldChunkInterestBudget("desktop")).toMatchObject({ activeRadius: 0, preloadRadius: 1, farRadius: 2 });
    expect(plan.active).toHaveLength(1);
    expect(plan.preload).toHaveLength(8);
    expect(plan.far).toHaveLength(16);
    expect(plan.far.every(entry => entry.presentation === "hlod" && entry.simulationDemand === "none")).toBe(true);
    expect([...plan.preload, ...plan.far].every(entry => entry.simulationDemand === "none")).toBe(true);
  });

  it("classifies exact boundaries deterministically and returns null outside the streamed window", () => {
    const center = { x: 10, z: 10 };
    expect(classifyWorldChunkInterest(center, center, "desktop")).toBe("active");
    expect(classifyWorldChunkInterest(center, { x: 11, z: 9 }, "desktop")).toBe("preload");
    expect(classifyWorldChunkInterest(center, { x: 12, z: 8 }, "desktop")).toBe("far");
    expect(classifyWorldChunkInterest(center, { x: 13, z: 10 }, "desktop")).toBeNull();
  });

  it("makes presentation and simulation policy explicit rather than treating visibility as gameplay", () => {
    expect(worldChunkPresentationMode("active")).toBe("full");
    expect(worldChunkPresentationMode("preload")).toBe("prepared");
    expect(worldChunkPresentationMode("far")).toBe("hlod");
    expect(worldChunkSimulationDemand("active")).toBe("confirmed-active-only");
    expect(worldChunkSimulationDemand("preload")).toBe("none");
    expect(worldChunkSimulationDemand("far")).toBe("none");
  });

  it("reuses deterministic LRU retention and exposes background cache separately from visible rings", () => {
    const cached = Array.from({ length: 14 }, (_, index) => ({ coordinate: { x: 50 + index, z: 0 }, lastAccess: index }));
    const first = planWorldChunkInterest({ center: { x: 0, z: 0 }, tier: "phone", cached });
    const second = planWorldChunkInterest({ center: { x: 0, z: 0 }, tier: "phone", cached: [...cached].reverse() });
    expect(first.backgroundCache.map(worldChunkCoordinateKey)).toEqual(["63:0", "62:0", "61:0"]);
    expect(first.evict.map(worldChunkCoordinateKey)).toEqual(["50:0", "51:0", "52:0", "53:0", "54:0", "55:0", "56:0", "57:0", "58:0", "59:0", "60:0"]);
    expect(second).toEqual(first);
  });

  it("keeps every visible coordinate represented exactly once across active, preload and far", () => {
    const plan = planWorldChunkInterest({ center: { x: -7, z: 6 }, tier: "desktop", cached: [] });
    const keys = [...plan.active, ...plan.preload, ...plan.far].map(entry => worldChunkCoordinateKey(entry.coordinate));
    expect(keys).toHaveLength(25);
    expect(new Set(keys).size).toBe(25);
    expect(keys[0]).toBe("-7:6");
  });
});
