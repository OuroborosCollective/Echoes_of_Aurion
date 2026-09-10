import { describe, expect, it } from "vitest";
import { AX1_CRAFTING_SOURCE_REVISION } from "../shared/ax1CraftingCatalog";
import {
  AX1_CRAFTING_RULESET_VERSION,
  ax1CraftingRecipeDigest,
  canonicalizeAx1CraftingInputs,
  resolveAx1CraftingPlan,
  type Ax1CraftingInputItem,
} from "./ax1CraftingProtocol";

function material(id: string, baseItemKey: string): Ax1CraftingInputItem {
  return Object.freeze({ id, baseItemKey });
}

const holzkisteInputs = Object.freeze([
  material("wood_04", "mat_wood_oak"),
  material("wood_02", "mat_wood_oak"),
  material("copper_01", "mat_ore_copper"),
  material("wood_01", "mat_wood_oak"),
  material("wood_03", "mat_wood_oak"),
]);

describe("AX1 crafting protocol", () => {
  it("bindet das echte AX1-Holzkistenrezept deterministisch an vier Holz- und ein Kupfer-Item", () => {
    const first = resolveAx1CraftingPlan({
      recipeId: "recipe_carpenter_holzkiste",
      professionLevel: 1,
      inputs: holzkisteInputs,
    });
    const second = resolveAx1CraftingPlan({
      recipeId: "recipe_carpenter_holzkiste",
      professionLevel: 1,
      inputs: [...holzkisteInputs].reverse(),
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      recipeId: "recipe_carpenter_holzkiste",
      professionId: "carpenter",
      outputItemId: "item_carpenter_holzkiste",
      outputQuantity: 1,
      xpReward: 35,
      sourceRevision: AX1_CRAFTING_SOURCE_REVISION,
      ruleSetVersion: AX1_CRAFTING_RULESET_VERSION,
      inputItemIds: ["copper_01", "wood_01", "wood_02", "wood_03", "wood_04"],
    });
    expect(first.recipeDigest).toBe(ax1CraftingRecipeDigest("recipe_carpenter_holzkiste"));
    expect(first.inputBundleDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.deterministicHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verwirft doppelte konkrete Input-IDs vor jeder Materialauflösung", () => {
    expect(() => canonicalizeAx1CraftingInputs([
      material("same", "mat_wood_oak"),
      material("same", "mat_ore_copper"),
    ])).toThrow("AX1_CRAFTING_INPUT_DUPLICATE");
  });

  it("verwirft fehlende Materialien und zu viele Inputs fail-closed", () => {
    expect(() => resolveAx1CraftingPlan({
      recipeId: "recipe_carpenter_holzkiste",
      professionLevel: 1,
      inputs: holzkisteInputs.slice(0, 4),
    })).toThrow("AX1_CRAFTING_MATERIAL_COUNT_MISMATCH");

    expect(() => resolveAx1CraftingPlan({
      recipeId: "recipe_carpenter_holzkiste",
      professionLevel: 1,
      inputs: [...holzkisteInputs, material("extra_01", "mat_wood_oak")],
    })).toThrow("AX1_CRAFTING_MATERIAL_COUNT_MISMATCH");
  });

  it("verwirft die richtige Gesamtzahl mit falscher Materialzusammensetzung", () => {
    expect(() => resolveAx1CraftingPlan({
      recipeId: "recipe_carpenter_holzkiste",
      professionLevel: 1,
      inputs: [
        material("wood_01", "mat_wood_oak"),
        material("wood_02", "mat_wood_oak"),
        material("wood_03", "mat_wood_oak"),
        material("wood_04", "mat_wood_oak"),
        material("leather_01", "mat_leather_raw"),
      ],
    })).toThrow("AX1_CRAFTING_MATERIAL_REQUIREMENT_MISMATCH");
  });

  it("erzwingt den AX1-Berufslevel und unbekannte Rezepte fail-closed", () => {
    expect(() => resolveAx1CraftingPlan({
      recipeId: "recipe_carpenter_werkbank",
      professionLevel: 4,
      inputs: [
        ...Array.from({ length: 8 }, (_, index) => material(`wood_${index}`, "mat_wood_oak")),
        ...Array.from({ length: 4 }, (_, index) => material(`copper_${index}`, "mat_ore_copper")),
        material("leather_0", "mat_leather_raw"),
        material("leather_1", "mat_leather_raw"),
      ],
    })).toThrow("AX1_CRAFTING_PROFESSION_LEVEL_TOO_LOW");

    expect(() => resolveAx1CraftingPlan({
      recipeId: "recipe_unknown",
      professionLevel: 100,
      inputs: holzkisteInputs,
    })).toThrow("AX1_CRAFTING_RECIPE_UNKNOWN");
  });

  it("bindet Mehrfachoutput ohne Zufall oder Wallclock an denselben Plan", () => {
    const inputs = [
      material("herb_01", "mat_herb_sunroot"),
      material("herb_02", "mat_herb_sunroot"),
      material("wheat_01", "mat_wheat_amber"),
    ];
    const first = resolveAx1CraftingPlan({ recipeId: "recipe_alchemist_heiltrank", professionLevel: 1, inputs });
    const replay = resolveAx1CraftingPlan({ recipeId: "recipe_alchemist_heiltrank", professionLevel: 1, inputs });
    expect(first).toEqual(replay);
    expect(first.outputQuantity).toBe(2);
    expect(first.outputItemId).toBe("item_alch_heiltrank");
  });
});
