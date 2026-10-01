import { canonicalSha256 } from "../shared/aurionCanonicalHash";

export const AURION_INVENTORY_STACKABLE_CATEGORIES = ["crafting_component", "shaping_component"] as const;

export function isAurionInventoryStackable(input: Readonly<{ category: string; equipmentSlot?: string | null }>): boolean {
  return input.equipmentSlot == null && AURION_INVENTORY_STACKABLE_CATEGORIES.includes(
    input.category as (typeof AURION_INVENTORY_STACKABLE_CATEGORIES)[number],
  );
}

export function inventoryItemShapeHash(input: Readonly<{
  definitionId: string;
  category: string;
  equipmentSlot: string | null;
  quality: string;
  levelExact: string;
  affixesJson: string;
  setId: string | null;
  itemPower: number;
}>): string {
  return canonicalSha256({
    domain: "aurion.inventory.item-shape.v1",
    definitionId: input.definitionId,
    category: input.category,
    equipmentSlot: input.equipmentSlot,
    quality: input.quality,
    levelExact: input.levelExact,
    affixesJson: input.affixesJson,
    setId: input.setId,
    itemPower: input.itemPower,
  });
}

export function inventoryMaxQuantityExact(input: Readonly<{ category: string; equipmentSlot?: string | null }>): string {
  return isAurionInventoryStackable(input) ? "1000000" : "1";
}

export function legacyInventoryProvenanceHash(itemId: string): string {
  return canonicalSha256({
    domain: "aurion.inventory.legacy-provenance.v1",
    itemId,
  });
}

export function legacyInventoryMergeKey(itemId: string): string {
  return canonicalSha256({
    domain: "aurion.inventory.legacy-merge-key.v1",
    itemId,
  });
}
