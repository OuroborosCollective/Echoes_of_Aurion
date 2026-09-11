import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  AX1_ECOLOGY_SOURCE_REVISION,
  AX1_INITIAL_RESOURCE_NODES,
  AX1_RESOURCE_DENSITY_BY_BIOME,
  ax1ResourceDensityForBiome,
  ax1ResourceNodeById,
} from "../shared/ax1ResourceEcologyProtocol";
import {
  AX1_ARMOR_MASTERIES,
  AX1_ARMOR_MASTERY_SOURCE_REVISION,
  ax1ArmorMasteryByType,
} from "../shared/ax1ArmorMasteryProtocol";

const AX1_UPDATE_REVISION = "286c575d3d0050ffa77b794d5b7a7e24858acee8";
const guardedProductionPaths = [
  "shared/ax1ResourceEcologyProtocol.ts",
  "shared/ax1ArmorMasteryProtocol.ts",
  "client/src/xaurion/core/Ax1CombatTelegraphPresenter.ts",
  "client/src/xaurion/integration/ResourceNodeProjection.ts",
] as const;

function forbiddenImplicitCalls(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const forbidden: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (["Math.random", "Date.now", "performance.now", "crypto.randomUUID", "setTimeout", "setInterval"].includes(callee)) {
        forbidden.push(`${path}:${callee}`);
      }
    }
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) {
      forbidden.push(`${path}:implicit Date`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return forbidden;
}

describe("AX1 286c575 selective integration contract", () => {
  it("binds imported content to the exact reviewed AX1 revision", () => {
    expect(AX1_ECOLOGY_SOURCE_REVISION).toBe(AX1_UPDATE_REVISION);
    expect(AX1_ARMOR_MASTERY_SOURCE_REVISION).toBe(AX1_UPDATE_REVISION);
    const presenterSource = readFileSync("client/src/xaurion/core/Ax1CombatTelegraphPresenter.ts", "utf8");
    expect(presenterSource).toContain(`AX1_COMBAT_PRESENTATION_SOURCE_REVISION = "${AX1_UPDATE_REVISION}"`);
  });

  it("preserves the reviewed deterministic biome density table", () => {
    expect(AX1_RESOURCE_DENSITY_BY_BIOME.whispering_forest).toEqual({ wood: 1.8, herb: 1.5, ore: 0.5, fabric: 1, leather: 1 });
    expect(AX1_RESOURCE_DENSITY_BY_BIOME.scorched_quarry).toEqual({ wood: 0.1, herb: 0.3, ore: 2.2, fabric: 1, leather: 1 });
    expect(AX1_RESOURCE_DENSITY_BY_BIOME.void_crater).toEqual({ wood: 0, herb: 0.2, ore: 2.5, fabric: 1, leather: 1 });
    expect(AX1_RESOURCE_DENSITY_BY_BIOME.ancient_dungeon).toEqual({ wood: 0, herb: 0.1, ore: 2, fabric: 1, leather: 1 });
    expect(ax1ResourceDensityForBiome("unknown-biome")).toBeUndefined();
  });

  it("imports resource nodes as immutable content rather than mutable local gameplay state", () => {
    expect(AX1_INITIAL_RESOURCE_NODES).toHaveLength(5);
    expect(ax1ResourceNodeById("node_copper_1")).toMatchObject({
      resourceItemId: "res_copper_tin_ore",
      requiredProfession: "miner",
      requiredToolCategory: "Pickaxe",
      capacity: 5,
    });
    expect(ax1ResourceNodeById("node_cotton_1")).toMatchObject({ requiredProfession: "farmer", requiredToolCategory: "Sickle" });
    expect(ax1ResourceNodeById("node_beast_1")).toMatchObject({ requiredProfession: "hunter", requiredToolCategory: "Skinning Knife" });
    expect(ax1ResourceNodeById("missing")).toBeUndefined();
    for (const node of AX1_INITIAL_RESOURCE_NODES) {
      expect(Object.isFrozen(node)).toBe(true);
      expect("isDepleted" in node).toBe(false);
      expect("respawnTimeSeconds" in node).toBe(false);
      expect("amount" in node).toBe(false);
    }
  });

  it("imports all eight armor mastery identities without local progression policy", () => {
    expect(AX1_ARMOR_MASTERIES.map(entry => entry.type)).toEqual([
      "shoulder", "bracers", "gloves", "chest", "shoes", "legs", "helmet", "cape",
    ]);
    expect(ax1ArmorMasteryByType("cape")).toMatchObject({ initialLevel: 1, initialXp: 0, initialThresholdXp: 120 });
    expect(ax1ArmorMasteryByType("unknown")).toBeUndefined();
  });

  it("forbids implicit randomness, clocks and local timers in imported production modules", () => {
    expect(guardedProductionPaths.flatMap(forbiddenImplicitCalls)).toEqual([]);
  });

  it("keeps the combat telegraph adapter presentation-only", () => {
    const source = readFileSync("client/src/xaurion/core/Ax1CombatTelegraphPresenter.ts", "utf8");
    const forbiddenTruthWriters = [
      ".damageMob(",
      ".inventory.push(",
      "gainArmorMasteryXp(",
      "gainWeaponMasteryXp(",
      "rewardGold",
      "rewardXp",
      "respawnTime",
      "isDepleted =",
    ];
    expect(forbiddenTruthWriters.filter(token => source.includes(token))).toEqual([]);
    expect(source).toContain("Presentation-only AX1 telegraph renderer");
  });

  it("keeps confirmed resource-node rendering presentation-only", () => {
    const source = readFileSync("client/src/xaurion/integration/ResourceNodeProjection.ts", "utf8");
    const forbiddenTruthWriters = [
      "applyConfirmedConsumption(",
      ".inventory.push(",
      "gainArmorMasteryXp(",
      "gainWeaponMasteryXp(",
      "rewardGold",
      "rewardXp",
      "respawnTimeSeconds",
    ];
    expect(forbiddenTruthWriters.filter(token => source.includes(token))).toEqual([]);
    expect(source).toContain("Presentation-only projection of the confirmed Zone v5 resource readback");
  });
});
