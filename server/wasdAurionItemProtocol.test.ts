import { describe, expect, it } from "vitest";
import { resolveInventory, resolveItemTransfer } from "./wasdAurionItemProtocol";

describe("wasdAurionItemProtocol", () => {
  const definitions = [
    { id: "tonic", kind: "consumable" as const, rarity: "common" as const, maxStack: 3, weight: 0.2 },
    { id: "iron_sword", kind: "weapon" as const, rarity: "uncommon" as const, stackable: false, weight: 4 },
    { id: "soulbound_relic", kind: "misc" as const, rarity: "legendary" as const, boundOnAcquire: true, tradeable: false, droppable: false, weight: 1 },
  ];

  it("normalizes stackable items while preserving unique equipment rows", () => {
    const inventory = resolveInventory({ items: [{ itemId: "tonic", quantity: 5 }, { itemId: "tonic", quantity: 1 }, { itemId: "iron_sword", quantity: 1 }], definitions, capacity: 10, receiptId: "inventory-1" });
    expect(inventory.stacks.map(stack => [stack.itemId, stack.quantity])).toEqual([["tonic", 3], ["tonic", 3], ["iron_sword", 1]]);
    expect(inventory.overCapacity).toBe(false);
  });

  it("calculates capacity and enforces transfer restrictions from item definition", () => {
    const inventory = resolveInventory({ items: [{ itemId: "iron_sword", quantity: 3 }], definitions, capacity: 10, receiptId: "inventory-2" });
    expect(inventory).toMatchObject({ totalWeight: 12, overCapacity: true });
    expect(resolveItemTransfer({ definition: definitions[2]!, channel: "trade", receiptId: "transfer-1" })).toMatchObject({ state: "rejected", reason: "bound" });
    expect(resolveItemTransfer({ definition: definitions[0]!, channel: "trade", receiptId: "transfer-2" }).state).toBe("allowed");
  });
});
