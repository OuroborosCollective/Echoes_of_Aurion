import { createHash } from "node:crypto";

/** Pure, receipt-bound Aurion adapters for Wasd item and inventory semantics. */
export type AurionItemKind = "weapon" | "armor" | "consumable" | "misc";
export type AurionItemDefinition = { id: string; kind: AurionItemKind; rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mystic"; stackable?: boolean; maxStack?: number; weight?: number; boundOnAcquire?: boolean; nonTransferable?: boolean; tradeable?: boolean; droppable?: boolean };
export type AurionInventoryStack = { itemId: string; quantity: number; kind: AurionItemKind; rarity: AurionItemDefinition["rarity"]; boundOnAcquire: boolean; nonTransferable: boolean; tradeable: boolean; droppable: boolean; receiptHash: string };
export type InventoryResolution = { stacks: readonly AurionInventoryStack[]; totalWeight: number; overCapacity: boolean; receiptHash: string };
export type ItemTransferDecision = { state: "allowed" | "rejected"; reason?: "bound" | "non_transferable" | "not_tradeable" | "not_droppable"; receiptHash: string };

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const safeQuantity = (quantity: number) => Math.max(0, Math.floor(Number.isFinite(quantity) ? quantity : 0));
const maxStack = (definition: AurionItemDefinition) => Math.min(99, Math.max(1, Math.floor(definition.maxStack ?? 99)));
const canStack = (definition: AurionItemDefinition) => definition.stackable ?? (definition.kind === "consumable" || definition.kind === "misc");

export function resolveInventory(input: { items: readonly { itemId: string; quantity: number }[]; definitions: readonly AurionItemDefinition[]; capacity: number; receiptId: string }): InventoryResolution {
  if (!input.receiptId) throw new Error("Inventory resolution requires a receipt");
  const definitions = new Map(input.definitions.map(definition => [definition.id, definition]));
  const buckets = new Map<string, number>();
  const unique: { itemId: string; quantity: number; definition: AurionItemDefinition }[] = [];
  input.items.forEach(row => {
    const definition = definitions.get(row.itemId);
    const quantity = safeQuantity(row.quantity);
    if (!definition || quantity === 0) return;
    if (canStack(definition)) buckets.set(row.itemId, (buckets.get(row.itemId) ?? 0) + quantity);
    else unique.push({ itemId: row.itemId, quantity, definition });
  });
  const rows: { itemId: string; quantity: number; definition: AurionItemDefinition }[] = [];
  Array.from(buckets.entries()).sort(([left], [right]) => compare(left, right)).forEach(([itemId, total]) => {
    const definition = definitions.get(itemId)!;
    let remaining = total;
    while (remaining > 0) {
      const quantity = Math.min(maxStack(definition), remaining);
      rows.push({ itemId, quantity, definition });
      remaining -= quantity;
    }
  });
  rows.push(...unique.sort((left, right) => compare(left.itemId, right.itemId)));
  const stacks = rows.map(row => ({ itemId: row.itemId, quantity: row.quantity, kind: row.definition.kind, rarity: row.definition.rarity, boundOnAcquire: Boolean(row.definition.boundOnAcquire), nonTransferable: Boolean(row.definition.nonTransferable), tradeable: row.definition.tradeable !== false, droppable: row.definition.droppable !== false, receiptHash: hash(["wasd:inventory:v1", row.itemId, String(row.quantity), input.receiptId]) }));
  const totalWeight = rows.reduce((total, row) => total + row.quantity * Math.max(0, row.definition.weight ?? 1), 0);
  return { stacks, totalWeight, overCapacity: totalWeight > Math.max(0, input.capacity), receiptHash: hash(["wasd:inventory:v1", input.receiptId, ...stacks.map(stack => stack.receiptHash), String(totalWeight)]) };
}

export function resolveItemTransfer(input: { definition: AurionItemDefinition; channel: "trade" | "drop"; receiptId: string }): ItemTransferDecision {
  const reject = (reason: NonNullable<ItemTransferDecision["reason"]>) => ({ state: "rejected" as const, reason, receiptHash: hash(["wasd:item-transfer:v1", input.definition.id, input.channel, input.receiptId, reason]) });
  if (input.definition.boundOnAcquire) return reject("bound");
  if (input.definition.nonTransferable) return reject("non_transferable");
  if (input.channel === "trade" && input.definition.tradeable === false) return reject("not_tradeable");
  if (input.channel === "drop" && input.definition.droppable === false) return reject("not_droppable");
  return { state: "allowed", receiptHash: hash(["wasd:item-transfer:v1", input.definition.id, input.channel, input.receiptId, "allowed"]) };
}
