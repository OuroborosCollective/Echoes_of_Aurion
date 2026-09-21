import { describe, expect, it, vi } from "vitest";
import { resolveStarterGlbRuntimeAssets, STARTER_GLB_TARGET_KEYS } from "./starterGlbRuntimeAssets";

describe("starter GLB runtime assignment readback", () => {
  it("reads only the canonical active player, spider and four beast LOD assignment keys", async () => {
    const readAssignment = vi.fn(async (targetType: "character" | "enemy", targetKey: string) => ({
      assetId: `asset_${targetKey}`,
      storageUrl: `https://assets.example/${targetKey}.glb`,
    }));

    const result = await resolveStarterGlbRuntimeAssets(readAssignment);

    expect(readAssignment.mock.calls).toEqual([
      ["character", STARTER_GLB_TARGET_KEYS.player],
      ["enemy", STARTER_GLB_TARGET_KEYS.spider],
      ["enemy", STARTER_GLB_TARGET_KEYS.beastLods[0]],
      ["enemy", STARTER_GLB_TARGET_KEYS.beastLods[1]],
      ["enemy", STARTER_GLB_TARGET_KEYS.beastLods[2]],
      ["enemy", STARTER_GLB_TARGET_KEYS.beastLods[3]],
    ]);
    expect(result.schemaVersion).toBe("aurion.starter-glb-runtime.v1");
    expect(result.player).toEqual({ assetId: "asset_starter_player", storageUrl: "https://assets.example/starter_player.glb" });
    expect(result.spider?.assetId).toBe("asset_starter_spider");
    expect(result.beastLods.map(asset => asset?.assetId)).toEqual([
      "asset_starter_beast_lod0",
      "asset_starter_beast_lod1",
      "asset_starter_beast_lod2",
      "asset_starter_beast_lod3",
    ]);
  });

  it("represents missing approved assignments as null instead of inventing assets", async () => {
    const result = await resolveStarterGlbRuntimeAssets(async (_type, key) => key === STARTER_GLB_TARGET_KEYS.spider
      ? { assetId: "asset_spider", storageUrl: "https://assets.example/spider.glb" }
      : null);

    expect(result.player).toBeNull();
    expect(result.spider).toEqual({ assetId: "asset_spider", storageUrl: "https://assets.example/spider.glb" });
    expect(result.beastLods).toEqual([null, null, null, null]);
  });
});
