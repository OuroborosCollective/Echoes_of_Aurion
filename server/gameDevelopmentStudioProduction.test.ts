import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { testGlb } from "./glbImportFixtures";
import {
  buildGameDevPackageBuildArgs,
  buildGameDevVendorAdmitArgs,
  gameDevelopmentStudioLiveAssetInputSchema,
  gameDevelopmentStudioRightsLabel,
  planGameDevelopmentStudioLiveAsset,
} from "./gameDevelopmentStudioProduction";

const originalWorkspace = process.env.AURION_GAME_DEV_WORKSPACE;
const roots: string[] = [];

afterEach(async () => {
  if (originalWorkspace === undefined) delete process.env.AURION_GAME_DEV_WORKSPACE;
  else process.env.AURION_GAME_DEV_WORKSPACE = originalWorkspace;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function input(license = "CC0-1.0") {
  return gameDevelopmentStudioLiveAssetInputSchema.parse({
    displayName: "Aurion Studio Spear",
    fileName: "Aurion_Spear_Weapon.glb",
    contentBase64: testGlb("Aurion_Spear_Weapon").toString("base64"),
    purpose: "equipment",
    packageVersion: "1.0.0",
    rightsBasis: "licensed",
    license,
    designWorkOrderSha256: "a".repeat(64),
  });
}

function ownerCreatedInput() {
  return gameDevelopmentStudioLiveAssetInputSchema.parse({
    displayName: "Lyra Keeper of the Observatory",
    fileName: "Lyra_character_questgiver.glb",
    contentBase64: testGlb("Lyra_character_questgiver").toString("base64"),
    purpose: "npc-fallback",
    packageVersion: "1.0.0",
    rightsBasis: "owner-created-private",
  });
}

describe("productive Game Development Studio live admission contract", () => {
  it("keeps package construction separate from the explicit vendor confirmation", () => {
    expect(buildGameDevPackageBuildArgs("/tmp/source.glb", "/tmp/output", input())).toEqual([
      "package", "build", "/tmp/source.glb",
      "--name", "Aurion Studio Spear",
      "--version", "1.0.0",
      "--license", "CC0-1.0",
      "--output-dir", "/tmp/output",
      "--json",
    ]);
    expect(buildGameDevVendorAdmitArgs("/tmp/package", "/tmp/project", "/tmp/output", false)).not.toContain("--confirm");
    const confirmed = buildGameDevVendorAdmitArgs("/tmp/package", "/tmp/project", "/tmp/output", true);
    expect(confirmed.filter(value => value === "--confirm")).toHaveLength(1);
  });

  it("rejects unknown licensed assets but accepts owner-created private rights without a foreign license", () => {
    expect(() => input("unknown")).toThrow("explicit license required");
    const owner = ownerCreatedInput();
    expect(owner.license).toBeUndefined();
    expect(gameDevelopmentStudioRightsLabel(owner)).toBe("Proprietary-Owner-Created");
    expect(buildGameDevPackageBuildArgs("/tmp/source.glb", "/tmp/output", owner)).toContain("Proprietary-Owner-Created");
  });

  it("creates a deterministic review plan from real GLB bytes and GDS validation evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "aurion-game-dev-plan-"));
    roots.push(root);
    process.env.AURION_GAME_DEV_WORKSPACE = root;
    const recorded: string[][] = [];
    const runner = async (args: readonly string[]) => {
      recorded.push([...args]);
      if (args[0] !== "asset") throw new Error("unexpected command");
      if (args[1] === "inspect") {
        return JSON.stringify({ operation: "asset.inspect", ok: true, data: { schema: "org.gamedebug.asset_inspection.v1", modelPath: args[2], meshCount: 1, materialCount: 0 } });
      }
      if (args[1] === "validate") {
        return JSON.stringify({ operation: "asset.validate", ok: true, data: { schema: "org.gamedebug.asset_validation.v1", modelPath: args[2], passed: true, errorCount: 0, warningCount: 0 } });
      }
      throw new Error("unexpected command");
    };
    const first = await planGameDevelopmentStudioLiveAsset(input(), runner);
    const second = await planGameDevelopmentStudioLiveAsset(input(), runner);

    expect(first).toEqual(second);
    expect(first.validationPassed).toBe(true);
    expect(first.requiresHumanConfirmation).toBe(true);
    expect(first.providerCalls).toBe(false);
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.aurionPlanSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(recorded.map(args => args.slice(0, 2))).toEqual([
      ["asset", "inspect"], ["asset", "validate"],
      ["asset", "inspect"], ["asset", "validate"],
    ]);
    expect(recorded.flat()).not.toContain("--confirm");
  });
});
