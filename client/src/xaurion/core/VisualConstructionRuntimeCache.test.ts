import { describe, expect, it } from "vitest";
import {
  visualConstructionCacheKey,
  VisualConstructionRuntimeCache,
} from "./VisualConstructionRuntimeCache";

const input = (overrides: Partial<Parameters<typeof visualConstructionCacheKey>[0]> = {}) => ({
  descriptorHash: "a".repeat(64),
  grammarVersion: "aurion-visual-morphology.v1",
  avatarProfileVersion: "aurion-avatar-profile.v1",
  fitVersion: "aurion-equipment-fit.v1",
  lod: 0 as const,
  ...overrides,
});

describe("VisualConstructionRuntimeCache", () => {
  it("uses all projection dimensions in a stable cache key", () => {
    const base = visualConstructionCacheKey(input());
    expect(base).toBe(visualConstructionCacheKey(input()));
    expect(visualConstructionCacheKey(input({ lod: 1 }))).not.toBe(base);
    expect(visualConstructionCacheKey(input({ avatarProfileVersion: "aurion-avatar-profile.v2" }))).not.toBe(base);
    expect(visualConstructionCacheKey(input({ fitVersion: "aurion-equipment-fit.v2" }))).not.toBe(base);
    expect(visualConstructionCacheKey(input({ grammarVersion: "aurion-visual-morphology.v2" }))).not.toBe(base);
    expect(visualConstructionCacheKey(input({ descriptorHash: "b".repeat(64) }))).not.toBe(base);
  });

  it("is hit/miss equivalent and only stores caller-owned immutable values", () => {
    const cache = new VisualConstructionRuntimeCache<{ readonly recipeHash: string }>(4);
    const key = visualConstructionCacheKey(input());
    let builds = 0;
    const first = cache.getOrCreate(key, () => {
      builds += 1;
      return Object.freeze({ recipeHash: "recipe-001" });
    });
    const second = cache.getOrCreate(key, () => {
      builds += 1;
      return Object.freeze({ recipeHash: "should-not-build" });
    });

    expect(second).toEqual(first);
    expect(second).toBe(first);
    expect(builds).toBe(1);
    expect(cache.stats()).toMatchObject({ size: 1, hits: 1, misses: 1, evictions: 0 });
  });

  it("evicts by deterministic LRU order without changing reconstructed output", () => {
    const cache = new VisualConstructionRuntimeCache<number>(2);
    const keyA = visualConstructionCacheKey(input({ descriptorHash: "a".repeat(64), lod: 0 }));
    const keyB = visualConstructionCacheKey(input({ descriptorHash: "b".repeat(64), lod: 0 }));
    const keyC = visualConstructionCacheKey(input({ descriptorHash: "c".repeat(64), lod: 0 }));

    cache.set(keyA, 10);
    cache.set(keyB, 20);
    expect(cache.get(keyA)).toBe(10);
    cache.set(keyC, 30);

    expect(cache.has(keyA)).toBe(true);
    expect(cache.has(keyB)).toBe(false);
    expect(cache.has(keyC)).toBe(true);
    expect(cache.stats().evictions).toBe(1);
  });

  it("never persists cache state and reconstructs identically after a fresh runtime instance", () => {
    const key = visualConstructionCacheKey(input());
    const firstRuntime = new VisualConstructionRuntimeCache<string>(1);
    const secondRuntime = new VisualConstructionRuntimeCache<string>(1);

    const recipeA = firstRuntime.getOrCreate(key, () => "recipe-unchanged");
    secondRuntime.set(key, "recipe-unchanged");

    firstRuntime.clear();
    const recipeB = secondRuntime.getOrCreate(key, () => "recipe-rebuilt");

    expect(recipeA).toBe(recipeB);
    expect(firstRuntime.stats().size).toBe(0);
    expect(secondRuntime.stats().size).toBe(1);
  });

  it("rejects invalid capacities, keys and LOD values", () => {
    expect(() => new VisualConstructionRuntimeCache(0)).toThrow(/CAPACITY_INVALID/);
    expect(() => visualConstructionCacheKey(input({ lod: 3 as 0 }))).toThrow(/LOD_INVALID/);
    expect(() => visualConstructionCacheKey(input({ avatarProfileVersion: "" }))).toThrow(/AVATAR_PROFILE_VERSION_REQUIRED/);
    const cache = new VisualConstructionRuntimeCache(2);
    expect(() => cache.set("", 1)).toThrow(/KEY_REQUIRED/);
  });
});
