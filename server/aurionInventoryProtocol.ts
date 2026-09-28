import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  uiSlots,
  type ItemRecordVersion,
  type UiItem,
} from "../shared/playerUiProtocol";

export const AURION_INVENTORY_RULESET_VERSION = "aurion-inventory.v1" as const;
export type InventoryItemRef = Readonly<{
  id: string;
  version: ItemRecordVersion;
}>;
export type InventoryEquipmentBinding = Readonly<{
  slot: (typeof uiSlots)[number];
  id: string;
  version: ItemRecordVersion;
}>;
export type AurionInventoryReadback = Readonly<{
  items: readonly UiItem[];
  equipment: readonly InventoryEquipmentBinding[];
  stateHash: string;
}>;
export type AurionItemStatusTransition = Readonly<{
  item: InventoryItemRef;
  fromStatus: UiItem["status"];
  toStatus: UiItem["status"];
}>;
export type AurionEquipmentResolution = Readonly<{
  itemTransitions: readonly AurionItemStatusTransition[];
  equipment: InventoryEquipmentBinding | null;
  beforeHash: string;
  afterHash: string;
  transitionHash: string;
}>;

const statusOrder: Readonly<Record<UiItem["status"], number>> = Object.freeze({
  pending_pickup: 0,
  owned: 1,
  equipped: 2,
});
const textCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const refKey = (ref: InventoryItemRef): string => `${ref.version}:${ref.id}`;

function assertRef(ref: InventoryItemRef, code: string): void {
  if (
    !ref.id ||
    ref.id.length > 64 ||
    !["legacy", "aurion_v2", "ax1_starter"].includes(ref.version)
  )
    throw new Error(code);
}

function canonicalStats(
  stats: Readonly<Record<string, number>>
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats).sort(([left], [right]) =>
    textCompare(left, right)
  )) {
    if (!key || key.length > 128 || !Number.isFinite(value))
      throw new Error("AURION_INVENTORY_STAT_INVALID");
    result[key] = value;
  }
  return Object.freeze(result);
}

function canonicalItem(item: UiItem): UiItem {
  assertRef(item, "AURION_INVENTORY_ITEM_REF_INVALID");
  if (
    !item.receiptId ||
    !item.definition ||
    !item.name ||
    !/^[1-9][0-9]*$/.test(item.levelExact)
  )
    throw new Error("AURION_INVENTORY_ITEM_PROVENANCE_INVALID");
  if (item.slot !== null && !(uiSlots as readonly string[]).includes(item.slot))
    throw new Error("AURION_INVENTORY_SLOT_INVALID");
  if (statusOrder[item.status] === undefined)
    throw new Error("AURION_INVENTORY_STATUS_INVALID");
  return Object.freeze({ ...item, stats: canonicalStats(item.stats) });
}

function compareItem(left: UiItem, right: UiItem): number {
  return (
    statusOrder[left.status] - statusOrder[right.status] ||
    textCompare(left.slot ?? "", right.slot ?? "") ||
    textCompare(left.version, right.version) ||
    textCompare(left.id, right.id)
  );
}

function compareEquipment(
  left: InventoryEquipmentBinding,
  right: InventoryEquipmentBinding
): number {
  return (
    textCompare(left.slot, right.slot) ||
    textCompare(left.version, right.version) ||
    textCompare(left.id, right.id)
  );
}

function canonicalBinding(
  binding: InventoryEquipmentBinding
): InventoryEquipmentBinding {
  assertRef(binding, "AURION_INVENTORY_EQUIPMENT_REF_INVALID");
  if (!(uiSlots as readonly string[]).includes(binding.slot))
    throw new Error("AURION_INVENTORY_SLOT_INVALID");
  return Object.freeze({ ...binding });
}

function stateHash(
  userId: number,
  items: readonly UiItem[],
  equipment: readonly InventoryEquipmentBinding[]
): string {
  return canonicalSha256({
    domain: "aurion.inventory.readback.v1",
    rulesetVersion: AURION_INVENTORY_RULESET_VERSION,
    userId,
    items,
    equipment,
  });
}

export function canonicalizeAurionInventoryReadback(
  input: Readonly<{
    userId: number;
    items: readonly UiItem[];
    equipment: readonly InventoryEquipmentBinding[];
  }>
): AurionInventoryReadback {
  if (!Number.isSafeInteger(input.userId) || input.userId < 1)
    throw new Error("AURION_INVENTORY_OWNER_INVALID");
  if (input.items.length > 500 || input.equipment.length > uiSlots.length)
    throw new Error("AURION_INVENTORY_CAPACITY_EXCEEDED");
  const items = Object.freeze(input.items.map(canonicalItem).sort(compareItem));
  const equipment = Object.freeze(
    input.equipment.map(canonicalBinding).sort(compareEquipment)
  );
  if (
    new Set(items.map(refKey)).size !== items.length ||
    new Set(equipment.map(binding => binding.slot)).size !== equipment.length ||
    new Set(equipment.map(refKey)).size !== equipment.length
  )
    throw new Error("AURION_INVENTORY_DUPLICATE_BINDING");
  const itemsByRef = new Map(items.map(item => [refKey(item), item] as const));
  for (const binding of equipment) {
    const item = itemsByRef.get(refKey(binding));
    if (!item || item.status !== "equipped" || item.slot !== binding.slot)
      throw new Error("AURION_INVENTORY_EQUIPMENT_MISMATCH");
  }
  for (const item of items)
    if (
      item.status === "equipped" &&
      !equipment.some(binding => refKey(binding) === refKey(item))
    )
      throw new Error("AURION_INVENTORY_UNBOUND_EQUIPMENT");
  return Object.freeze({
    items,
    equipment,
    stateHash: stateHash(input.userId, items, equipment),
  });
}

function itemSnapshotHash(items: readonly UiItem[]): string {
  return canonicalSha256({
    domain: "aurion.inventory.transition-snapshot.v1",
    rulesetVersion: AURION_INVENTORY_RULESET_VERSION,
    items: [...items].map(canonicalItem).sort(compareItem),
  });
}

function transitionHash(
  action: string,
  beforeHash: string,
  afterHash: string,
  expectedCurrent: InventoryItemRef | null
): string {
  return canonicalSha256({
    domain: "aurion.inventory.transition.v1",
    rulesetVersion: AURION_INVENTORY_RULESET_VERSION,
    action,
    beforeHash,
    afterHash,
    expectedCurrent,
  });
}

function transition(
  item: UiItem,
  toStatus: UiItem["status"]
): AurionItemStatusTransition {
  return Object.freeze({
    item: Object.freeze({ id: item.id, version: item.version }),
    fromStatus: item.status,
    toStatus,
  });
}

function withStatus(item: UiItem, status: UiItem["status"]): UiItem {
  return Object.freeze({ ...canonicalItem(item), status });
}

export function resolveAurionPickupTransition(
  input: Readonly<{ item: UiItem }>
): AurionEquipmentResolution {
  const item = canonicalItem(input.item);
  if (item.status !== "pending_pickup" && item.status !== "owned")
    throw new Error("AURION_INVENTORY_ITEM_NOT_COLLECTABLE");
  const beforeHash = itemSnapshotHash([item]);
  const after =
    item.status === "pending_pickup" ? withStatus(item, "owned") : item;
  const afterHash = itemSnapshotHash([after]);
  return Object.freeze({
    itemTransitions: Object.freeze(
      item.status === "pending_pickup" ? [transition(item, "owned")] : []
    ),
    equipment: null,
    beforeHash,
    afterHash,
    transitionHash: transitionHash("pickup", beforeHash, afterHash, null),
  });
}

export function resolveAurionEquipTransition(
  input: Readonly<{
    target: UiItem;
    current: UiItem | null;
    expectedCurrent: InventoryItemRef | null;
  }>
): AurionEquipmentResolution {
  const target = canonicalItem(input.target);
  const current = input.current ? canonicalItem(input.current) : null;
  if (!target.slot || target.status === "pending_pickup")
    throw new Error("COLLECTED_EQUIPMENT_REQUIRED");
  if (current && current.slot !== target.slot)
    throw new Error("AURION_INVENTORY_EQUIPMENT_SLOT_CORRUPT");
  const binding = Object.freeze({
    slot: target.slot,
    id: target.id,
    version: target.version,
  });
  if (current && refKey(current) === refKey(target)) {
    if (target.status !== "equipped")
      throw new Error("AURION_INVENTORY_EQUIPMENT_SLOT_CORRUPT");
    const beforeHash = itemSnapshotHash([target]);
    return Object.freeze({
      itemTransitions: Object.freeze([]),
      equipment: binding,
      beforeHash,
      afterHash: beforeHash,
      transitionHash: transitionHash(
        "equip",
        beforeHash,
        beforeHash,
        input.expectedCurrent
      ),
    });
  }
  const currentRef = current
    ? { id: current.id, version: current.version }
    : null;
  if (
    (currentRef?.id ?? null) !== (input.expectedCurrent?.id ?? null) ||
    (currentRef?.version ?? null) !== (input.expectedCurrent?.version ?? null)
  )
    throw new Error("EQUIPMENT_SLOT_STALE");
  if (target.status !== "owned") throw new Error("EQUIPMENT_SLOT_STALE");
  if (current && current.status !== "equipped")
    throw new Error("AURION_INVENTORY_EQUIPMENT_SLOT_CORRUPT");
  const before = current ? [target, current] : [target];
  const after = current
    ? [withStatus(target, "equipped"), withStatus(current, "owned")]
    : [withStatus(target, "equipped")];
  const beforeHash = itemSnapshotHash(before);
  const afterHash = itemSnapshotHash(after);
  const transitions = [
    transition(target, "equipped"),
    ...(current ? [transition(current, "owned")] : []),
  ].sort((left, right) => textCompare(refKey(left.item), refKey(right.item)));
  return Object.freeze({
    itemTransitions: Object.freeze(transitions),
    equipment: binding,
    beforeHash,
    afterHash,
    transitionHash: transitionHash(
      "equip",
      beforeHash,
      afterHash,
      input.expectedCurrent
    ),
  });
}

export function resolveAurionUnequipTransition(
  input: Readonly<{ item: UiItem; binding: InventoryEquipmentBinding | null }>
): AurionEquipmentResolution {
  const item = canonicalItem(input.item);
  const binding = input.binding ? canonicalBinding(input.binding) : null;
  if (
    !item.slot ||
    item.status !== "equipped" ||
    !binding ||
    binding.slot !== item.slot ||
    refKey(binding) !== refKey(item)
  )
    throw new Error("EQUIPMENT_SLOT_STALE");
  const beforeHash = itemSnapshotHash([item]);
  const afterHash = itemSnapshotHash([withStatus(item, "owned")]);
  return Object.freeze({
    itemTransitions: Object.freeze([transition(item, "owned")]),
    equipment: null,
    beforeHash,
    afterHash,
    transitionHash: transitionHash("unequip", beforeHash, afterHash, binding),
  });
}
