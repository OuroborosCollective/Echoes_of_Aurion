import { describe, expect, it } from "vitest";
import { baselineReleaseAssets, assertReleaseAssetBudget } from "../shared/releaseAssetManifest";

describe("release asset manifest", () => {
  it("keeps every shipped starter character inside the mobile release budget", () => {
    expect(() => baselineReleaseAssets.forEach(assertReleaseAssetBudget)).not.toThrow();
  });

  it("rejects character geometry beyond the mobile budget", () => {
    expect(() => assertReleaseAssetBudget({ ...baselineReleaseAssets[0], triangles: 15_001 })).toThrow("Dreiecksbudget");
  });
});
