import { describe, expect, it } from "vitest";
import {
  gameDevelopmentStudioLiveAssetInputSchema,
  planGameDevelopmentStudioLiveAsset,
} from "./gameDevelopmentStudioProduction";
import { testGlb } from "./glbImportFixtures";

describe("gameDevelopmentStudioProduction", () => {
  it("documents owner-created private assets as Proprietary-Owner-Created without requiring invented license", async () => {
    const glbBase64 = testGlb("Temple_Dawn").toString("base64");
    const input = gameDevelopmentStudioLiveAssetInputSchema.parse({
      displayName: "Temple of Dawn",
      fileName: "temple_dawn.glb",
      contentBase64: glbBase64,
      purpose: "world-environment",
      rightsBasis: "owner-created-private",
      packageVersion: "1.0.0",
    });

    const plan = await planGameDevelopmentStudioLiveAsset(input);
    expect(plan.rightsBasis).toBe("owner-created-private");
    expect(plan.license).toBe("Proprietary-Owner-Created");
    expect(plan.providerSpend).toBe(false);
    expect(plan.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.validationStatus).toBe("valid");
  });

  it("requires a non-empty license string for licensed assets", async () => {
    const glbBase64 = testGlb("Wagon_Cart").toString("base64");
    const invalidInput = {
      displayName: "Licensed Wagon",
      fileName: "wagon.glb",
      contentBase64: glbBase64,
      purpose: "world-environment" as const,
      rightsBasis: "licensed" as const,
      license: "   ",
    };

    await expect(planGameDevelopmentStudioLiveAsset(invalidInput)).rejects.toThrow(
      "GDS_LICENSED_ASSET_REQUIRES_LICENSE"
    );

    const validInput = {
      ...invalidInput,
      license: "CC-BY-4.0",
    };
    const plan = await planGameDevelopmentStudioLiveAsset(validInput);
    expect(plan.rightsBasis).toBe("licensed");
    expect(plan.license).toBe("CC-BY-4.0");
  });

  it("rejects invalid GLB buffers missing the glTF magic header", async () => {
    const invalidBuffer = Buffer.from("not-a-valid-glb-file-at-all-at-least-twenty-bytes");
    const input = {
      displayName: "Corrupted Asset",
      fileName: "corrupt.glb",
      contentBase64: invalidBuffer.toString("base64"),
      purpose: "world-environment" as const,
      rightsBasis: "owner-created-private" as const,
    };

    await expect(planGameDevelopmentStudioLiveAsset(input)).rejects.toThrow(
      "GDS_INVALID_GLB_MAGIC"
    );
  });
});
