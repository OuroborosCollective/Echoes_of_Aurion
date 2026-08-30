import { describe, expect, it } from "vitest";
import { baselineReleaseAssets, assertReleaseAssetBudget } from "../shared/releaseAssetManifest";

describe("release asset manifest", () => {
  it("keeps every shipped starter character inside the mobile release budget", () => {
    expect(() => baselineReleaseAssets.forEach(assertReleaseAssetBudget)).not.toThrow();
  });

  it("rejects character geometry beyond the mobile budget", () => {
    const fixture = { id: "test-character", assetPath: "/manus-storage/test-character.glb", bytes: 1_000_000, triangles: 15_001, materials: 1, textures: 0, skins: 1, animations: 3 };
    expect(() => assertReleaseAssetBudget(fixture)).toThrow("Dreiecksbudget");
  });
});
