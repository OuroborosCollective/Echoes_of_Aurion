import { describe, expect, it } from "vitest";
import { allocateManipulationMaterials, allocatedManipulationMaterialEvidence, manipulationReceiptId } from "./aurionItemManipulationAllocation";

const row = (id: string, quantityExact: string, hash = "a".repeat(64)) => ({ id, quantityExact, baseItemDefinitionId: "iron", deterministicHash: hash });
const cause = (rows: ReturnType<typeof row>[]) => ({ userId: 7, operationIndex: 8, recipe: { id: "craft", version: "v2", allowedCategories: ["weapon", "armor"], allowedAffixIds: ["might", "ward"] }, craftingStateHash: `sha256:${"c".repeat(64)}`, materials: allocatedManipulationMaterialEvidence(allocateManipulationMaterials({ iron: 2 }, rows)) });
describe("confirmed paid manipulation cause", () => {
  it("ignores unused surplus, stock quantities, input traversal and splits of identical materials", () => {
    const baseline = manipulationReceiptId(cause([row("first", "2")]));
    for (let quantity = 2; quantity < 34; quantity++) {
      expect(manipulationReceiptId(cause([row("zz-unused", "100", "b".repeat(64)), row("first", String(quantity))]))).toBe(baseline);
    }
    expect(manipulationReceiptId(cause([row("split-b", "1"), row("split-a", "1")]))).toBe(baseline);
    expect(manipulationReceiptId(cause([row("first", "2", "b".repeat(64))]))).not.toBe(baseline);
    const reordered = cause([row("first", "2")]);
    reordered.recipe.allowedCategories.reverse(); reordered.recipe.allowedAffixIds.reverse();
    expect(manipulationReceiptId(reordered)).toBe(baseline);
    expect(allocateManipulationMaterials({ iron: 2 }, [row("first", "20"), row("zz-unused", "20")])).toMatchObject([{ id: "first", usedQuantityExact: "2" }]);
  });
  it("rejects an insufficient allocation before an effect can be planned", () => {
    expect(() => cause([row("first", "1")])).toThrow("AURION_ITEM_INSUFFICIENT_MATERIALS");
  });
});
