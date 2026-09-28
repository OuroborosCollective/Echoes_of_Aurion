import { describe, expect, it } from "vitest";
import {
  canonicalizeAurionInventoryReadback,
  resolveAurionEquipTransition,
  resolveAurionPickupTransition,
  resolveAurionUnequipTransition,
  type InventoryEquipmentBinding,
} from "./aurionInventoryProtocol";
import type { UiItem } from "../shared/playerUiProtocol";

const item = (overrides: Partial<UiItem> = {}): UiItem => ({
  id: "item:aurion:0001",
  version: "aurion_v2",
  name: "Aurion Blade",
  definition: "weapon-blade-v2",
  levelExact: "1",
  quality: "rare",
  slot: "main_hand",
  status: "owned",
  stats: { power: 8 },
  receiptId: "receipt:aurion:0001",
  ...overrides,
});
const binding = (source: UiItem): InventoryEquipmentBinding => ({
  slot: source.slot!,
  id: source.id,
  version: source.version,
});

describe("aurionInventoryProtocol", () => {
  it("canonicalizes a readback independently of database arrival order and binds its provenance", () => {
    const owned = item({
      id: "item:owned:0002",
      version: "legacy",
      receiptId: "receipt:owned:0002",
      stats: { guard: 3, power: 2 },
    });
    const equipped = item({ id: "item:equipped:0001", status: "equipped" });
    const first = canonicalizeAurionInventoryReadback({
      userId: 7,
      items: [owned, equipped],
      equipment: [binding(equipped)],
    });
    const replay = canonicalizeAurionInventoryReadback({
      userId: 7,
      items: [equipped, owned],
      equipment: [binding(equipped)],
    });
    expect(first).toEqual(replay);
    expect(first.items.map(entry => `${entry.status}:${entry.id}`)).toEqual([
      "owned:item:owned:0002",
      "equipped:item:equipped:0001",
    ]);
    expect(first.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      canonicalizeAurionInventoryReadback({
        userId: 7,
        items: [owned, equipped],
        equipment: [binding(equipped)],
      }).stateHash
    ).not.toBe(
      canonicalizeAurionInventoryReadback({
        userId: 7,
        items: [owned, { ...equipped, receiptId: "receipt:tampered" }],
        equipment: [binding(equipped)],
      }).stateHash
    );
    expect(() =>
      canonicalizeAurionInventoryReadback({
        userId: 7,
        items: [equipped, equipped],
        equipment: [binding(equipped)],
      })
    ).toThrow("AURION_INVENTORY_DUPLICATE_BINDING");
  });

  it("resolves collection idempotently and rejects non-collectable lifecycle states", () => {
    const collected = resolveAurionPickupTransition({
      item: item({ status: "pending_pickup" }),
    });
    expect(collected.itemTransitions).toEqual([
      {
        item: { id: "item:aurion:0001", version: "aurion_v2" },
        fromStatus: "pending_pickup",
        toStatus: "owned",
      },
    ]);
    expect(
      resolveAurionPickupTransition({ item: item() }).itemTransitions
    ).toEqual([]);
    expect(() =>
      resolveAurionPickupTransition({ item: item({ status: "equipped" }) })
    ).toThrow("AURION_INVENTORY_ITEM_NOT_COLLECTABLE");
  });

  it("resolves atomic slot replacement, no-op replay and stale/contradictory bindings fail closed", () => {
    const target = item({ id: "item:target:0002" });
    const current = item({ id: "item:current:0001", status: "equipped" });
    const replacement = resolveAurionEquipTransition({
      target,
      current,
      expectedCurrent: { id: current.id, version: current.version },
    });
    expect(replacement.itemTransitions).toEqual([
      {
        item: { id: current.id, version: current.version },
        fromStatus: "equipped",
        toStatus: "owned",
      },
      {
        item: { id: target.id, version: target.version },
        fromStatus: "owned",
        toStatus: "equipped",
      },
    ]);
    expect(replacement.equipment).toEqual(binding(target));
    const replay = resolveAurionEquipTransition({
      target: { ...target, status: "equipped" },
      current: { ...target, status: "equipped" },
      expectedCurrent: null,
    });
    expect(replay.itemTransitions).toEqual([]);
    expect(() =>
      resolveAurionEquipTransition({ target, current, expectedCurrent: null })
    ).toThrow("EQUIPMENT_SLOT_STALE");
    expect(() =>
      resolveAurionEquipTransition({
        target,
        current: { ...current, status: "owned" },
        expectedCurrent: { id: current.id, version: current.version },
      })
    ).toThrow("AURION_INVENTORY_EQUIPMENT_SLOT_CORRUPT");
    expect(
      resolveAurionUnequipTransition({
        item: { ...target, status: "equipped" },
        binding: binding(target),
      }).itemTransitions
    ).toEqual([
      {
        item: { id: target.id, version: target.version },
        fromStatus: "equipped",
        toStatus: "owned",
      },
    ]);
    expect(() =>
      resolveAurionUnequipTransition({
        item: { ...target, status: "equipped" },
        binding: null,
      })
    ).toThrow("EQUIPMENT_SLOT_STALE");
  });
});
