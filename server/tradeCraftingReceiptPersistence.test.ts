import { describe, expect, it } from "vitest";
import { normalizeTradeCraftingReceipt } from "./tradeCraftingReceiptPersistence";

const base = {
  userId: 12,
  characterId: "character-12",
  operationKind: "crafting" as const,
  operationId: "craft-temper-spear-12",
  sourceReceiptId: "craft-source-12",
  worldRevision: "world-epoch-14",
  marketContext: "emberfall-market-14",
  professionContext: "blacksmith",
  resourceDeltas: [{ resourceId: "asterion_iron", quantityExact: "-2" }, { resourceId: "moonwheat", quantityExact: "-1" }],
  resultJson: JSON.stringify({ itemId: "aurion_spear", quantity: "1" }),
  resultHash: "a".repeat(64),
  idempotencyKey: "trade-crafting-idempotency-12",
};

describe("AIM-233 trade and crafting receipt evidence", () => {
  it("binds resources, result, market, profession and actor context deterministically", () => {
    const result = normalizeTradeCraftingReceipt(base);
    expect(result.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.resourceDeltas.map(delta => delta.resourceId)).toEqual(["asterion_iron", "moonwheat"]);
  });

  it("requires profession context for crafting and rejects duplicate resources", () => {
    expect(() => normalizeTradeCraftingReceipt({ ...base, professionContext: null })).toThrow("CRAFTING_PROFESSION_CONTEXT_REQUIRED");
    expect(() => normalizeTradeCraftingReceipt({ ...base, resourceDeltas: [...base.resourceDeltas, { resourceId: "asterion_iron", quantityExact: "-1" }] })).toThrow("RESOURCE_DELTA_DUPLICATE");
  });

  it("changes the receipt hash when a result or source receipt changes", () => {
    const original = normalizeTradeCraftingReceipt(base);
    expect(normalizeTradeCraftingReceipt({ ...base, resultHash: "b".repeat(64) }).receiptHash).not.toBe(original.receiptHash);
    expect(normalizeTradeCraftingReceipt({ ...base, sourceReceiptId: "other-source-12" }).receiptHash).not.toBe(original.receiptHash);
  });
});
