import { describe, expect, it } from "vitest";
import { AURION_CRAFTING_CONTENT_VERSION, AURION_CRAFTING_RULESET_VERSION, craftingReceiptDigest, craftingRecipeDigest, getAurionCraftingRecipe, resolveAurionCraftingPlan, resolveCraftingResolutionIndex } from "./craftingProtocol";

describe("craftingProtocol", () => {
  const spear = { id: "item_aurion_spear", baseItemKey: "aurion_spear", quality: "normal" as const, itemLevel: 2 };

  it("löst eine Speerveredelung deterministisch aus einem passenden Aurion-Inventargegenstand auf", () => {
    const first = resolveAurionCraftingPlan({ recipeKey: "temper_aurion_spear", playerLevel: 1, item: spear });
    const second = resolveAurionCraftingPlan({ recipeKey: "temper_aurion_spear", playerLevel: 1, item: spear });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      plan: {
        inputItemId: "item_aurion_spear",
        output: { baseItemKey: "aurion_spear", quality: "magic", affixes: [{ key: "tempered", slot: "prefix", stats: { power: 2 } }] },
        recipe: { ruleSetVersion: AURION_CRAFTING_RULESET_VERSION, contentVersion: AURION_CRAFTING_CONTENT_VERSION },
      },
    });
  });

  it("weist unbekannte Rezepte, zu niedrige Stufen und fremde Eingaben zurück", () => {
    expect(resolveAurionCraftingPlan({ recipeKey: "unknown", playerLevel: 99, item: spear })).toEqual({ ok: false, reason: "recipe_not_found" });
    expect(resolveAurionCraftingPlan({ recipeKey: "temper_aurion_spear", playerLevel: 0, item: spear })).toEqual({ ok: false, reason: "level_too_low" });
    expect(resolveAurionCraftingPlan({ recipeKey: "temper_aurion_spear", playerLevel: 1, item: { ...spear, baseItemKey: "archive_staff" } })).toEqual({ ok: false, reason: "input_not_eligible" });
  });

  it("bindet Rezept und Receipt stabil an Eingabe, Schlüssel und serverseitigen Auflösungsindex", () => {
    const recipe = getAurionCraftingRecipe("temper_aurion_spear");
    expect(recipe).toBeDefined();
    const plan = resolveAurionCraftingPlan({ recipeKey: "temper_aurion_spear", playerLevel: 1, item: spear });
    if (!plan.ok) throw new Error("Der Testvektor muss craftbar sein.");
    expect(plan.plan.recipeDigest).toBe(craftingRecipeDigest(recipe!));
    const resolutionIndex = resolveCraftingResolutionIndex(4);
    const first = craftingReceiptDigest({ userId: 9, idempotencyKey: "craft:9:temper:1", plan: plan.plan, resolutionIndex });
    const replay = craftingReceiptDigest({ userId: 9, idempotencyKey: "craft:9:temper:1", plan: plan.plan, resolutionIndex });
    const distinct = craftingReceiptDigest({ userId: 9, idempotencyKey: "craft:9:temper:2", plan: plan.plan, resolutionIndex });
    expect(resolutionIndex).toBe(5);
    expect(first).toBe(replay);
    expect(first).not.toBe(distinct);
  });

  it("verwirft ungültige Auflösungsindizes und Receiptparameter", () => {
    expect(() => resolveCraftingResolutionIndex(-1)).toThrow("Ungültiger Crafting-Auflösungsindex");
    const plan = resolveAurionCraftingPlan({ recipeKey: "temper_aurion_spear", playerLevel: 1, item: spear });
    if (!plan.ok) throw new Error("Der Testvektor muss craftbar sein.");
    expect(() => craftingReceiptDigest({ userId: 0, idempotencyKey: "craft:9:temper:1", plan: plan.plan, resolutionIndex: 1 })).toThrow("Ungültige Spielerkennung");
    expect(() => craftingReceiptDigest({ userId: 9, idempotencyKey: "", plan: plan.plan, resolutionIndex: 1 })).toThrow("Ungültiger Crafting-Idempotenzschlüssel");
  });
});
