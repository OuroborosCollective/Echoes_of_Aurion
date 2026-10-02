import { canonicalSha256 } from "../shared/aurionCanonicalHash";

type Material = Readonly<{ id: string; baseItemDefinitionId: string; deterministicHash: string; quantityExact: string }>;
export function allocateManipulationMaterials(requirements: Readonly<Record<string, number>>, materials: readonly Material[]) {
  const remaining = Object.fromEntries(Object.entries(requirements).map(([id, quantity]) => [id, BigInt(quantity)]));
  const allocation: Array<Material & { usedQuantityExact: string }> = [];
  for (const row of [...materials].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const needed = remaining[row.baseItemDefinitionId] ?? 0n;
    const available = BigInt(row.quantityExact);
    const used = needed < available ? needed : available;
    if (!used) continue;
    allocation.push({ ...row, usedQuantityExact: String(used) });
    remaining[row.baseItemDefinitionId] = needed - used;
  }
  if (Object.values(remaining).some(quantity => quantity !== 0n)) throw new Error("AURION_ITEM_INSUFFICIENT_MATERIALS");
  return allocation;
}

/** Splitting identical materials or selecting surplus stacks cannot change the paid cause. */
export function allocatedManipulationMaterialEvidence(allocation: ReturnType<typeof allocateManipulationMaterials>) {
  const groups = new Map<string, { definitionId: string; deterministicHash: string; quantityExact: string }>();
  for (const row of allocation) {
    const key = JSON.stringify([row.baseItemDefinitionId, row.deterministicHash]);
    const previous = groups.get(key);
    groups.set(key, { definitionId: row.baseItemDefinitionId, deterministicHash: row.deterministicHash,
      quantityExact: String(BigInt(previous?.quantityExact ?? "0") + BigInt(row.usedQuantityExact)) });
  }
  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
}

export function manipulationReceiptId(cause: Readonly<{ userId: number; operationIndex: number; recipe: Readonly<{ id: string; version: string; allowedCategories: readonly string[]; allowedAffixIds: readonly string[] }>; sourceItemHash?: string; craftingStateHash: string; materials: ReturnType<typeof allocatedManipulationMaterialEvidence> }>) {
  const recipe = { ...cause.recipe, allowedCategories: [...cause.recipe.allowedCategories].sort(), allowedAffixIds: [...cause.recipe.allowedAffixIds].sort() };
  return `craft_${canonicalSha256({ domain: "aurion.manipulation.paid-cause.v2", ...cause, recipe }).slice(7, 55)}`;
}
