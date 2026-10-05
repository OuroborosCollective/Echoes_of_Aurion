import { describe, expect, it } from "vitest";
import type { PlayerUiReadback, UiItem } from "../shared/playerUiProtocol";
import {
  acegItemDefinition,
  resolveAcegEquipIntent,
  resolveCurrentAcegEquipment,
  scaleAcegEquipmentStat,
} from "./aurionAcegEquipmentAuthority";

function item(overrides: Partial<UiItem> = {}): UiItem {
  return {
    id: "item-00000001",
    version: "aurion_v2",
    name: "blade",
    definition: "weapon-blade-v2",
    levelExact: "99999999999999999999",
    quality: "rare",
    slot: "main_hand",
    status: "owned",
    stats: { power: 9 },
    receiptId: "loot-receipt-0001",
    quantityExact: "1",
    maxQuantityExact: "1",
    ...overrides,
  };
}
function ui(items: readonly UiItem[], equipment: PlayerUiReadback["equipment"] = []): PlayerUiReadback {
  return {
    version: "aurion.player-ui.v1",
    userId: 7,
    settings: { revision: 0, autoLoot: true, analyticsConsent: false, hotbar: ["1", "2", "3", "4", "5"], movementMode: "joystick" },
    items: [...items],
    equipment: [...equipment],
  };
}
const none = { stateIndex: 12, skillRanks: [], professionModifiers: [] } as const;

describe("ACEG equipment authority adapter", () => {
  it("uses capability gates rather than player or item level", () => {
    const candidate = item();
    expect(acegItemDefinition(candidate).requirements).toEqual([{ capability: "blade_mastery", minValue: 1 }]);
    expect(() => resolveAcegEquipIntent({
      userId: 7,
      sources: none,
      ui: ui([candidate]),
      confirmations: [],
      candidate,
      expectedItem: null,
      inventoryRevisionExact: "0",
      inventoryStateHash: `sha256:${"a".repeat(64)}`,
    })).toThrow("ACEG_EQUIPMENT_REQUIREMENTS_UNMET");
    const accepted = resolveAcegEquipIntent({
      userId: 7,
      sources: { ...none, skillRanks: [{ capability: "blade_mastery", delta: 1 }] },
      ui: ui([candidate]),
      confirmations: [],
      candidate,
      expectedItem: null,
      inventoryRevisionExact: "0",
      inventoryStateHash: `sha256:${"a".repeat(64)}`,
    });
    expect(accepted.decision).toMatchObject({ retention: "eligible", effectivenessBps: 10_000 });
    expect(accepted.confirmationReceiptId).toMatch(/^aceg:[a-f0-9]{59}$/);
  });

  it("lets already-confirmed equipment ladder a later item and excludes the replaced slot from self-support", () => {
    const ring = item({
      id: "ring-00000001",
      definition: "ring-sun-v2",
      slot: "ring",
      status: "equipped",
      stats: { blade_mastery: 1 },
      receiptId: "loot-ring-0001",
    });
    const candidate = item();
    const state = ui([ring, candidate], [{ id: ring.id, version: ring.version, slot: "ring" }]);
    const accepted = resolveAcegEquipIntent({
      userId: 7,
      sources: none,
      ui: state,
      confirmations: [{ id: ring.id, version: ring.version, slot: "ring", confirmationReceiptId: "equip-ring-confirmed" }],
      candidate,
      expectedItem: null,
      inventoryRevisionExact: "3",
      inventoryStateHash: `sha256:${"b".repeat(64)}`,
    });
    expect(accepted.decision.ladderPass).toBe(1);

    const oldBlade = item({ id: "old-blade-0001", status: "equipped", stats: { blade_mastery: 1 }, receiptId: "loot-old-blade" });
    const replacement = item({ id: "new-blade-0001", receiptId: "loot-new-blade" });
    expect(() => resolveAcegEquipIntent({
      userId: 7,
      sources: none,
      ui: ui([oldBlade, replacement], [{ id: oldBlade.id, version: oldBlade.version, slot: "main_hand" }]),
      confirmations: [{ id: oldBlade.id, version: oldBlade.version, slot: "main_hand", confirmationReceiptId: "equip-old-blade" }],
      candidate: replacement,
      expectedItem: oldBlade,
      inventoryRevisionExact: "4",
      inventoryStateHash: `sha256:${"c".repeat(64)}`,
    })).toThrow("ACEG_EQUIPMENT_REQUIREMENTS_UNMET");
  });

  it("retains confirmed equipment under OE rules after a capability disappears", () => {
    const blade = item({ status: "equipped" });
    const projection = resolveCurrentAcegEquipment({
      userId: 7,
      sources: none,
      ui: ui([blade], [{ id: blade.id, version: blade.version, slot: "main_hand" }]),
      confirmations: [{ id: blade.id, version: blade.version, slot: "main_hand", confirmationReceiptId: "equip-blade-confirmed" }],
    });
    expect(projection.resolution.equipDecisions[0]).toMatchObject({
      retention: "over_equip_confirmed",
      effectivenessBps: 9_975,
    });
    expect(scaleAcegEquipmentStat(100, 9_975)).toBe(99);
  });

  it("binds confirmations to exact inventory and resolution evidence", () => {
    const candidate = item();
    const input = {
      userId: 7,
      sources: { ...none, skillRanks: [{ capability: "blade_mastery", delta: 1 }] },
      ui: ui([candidate]),
      confirmations: [],
      candidate,
      expectedItem: null,
      inventoryRevisionExact: "8",
      inventoryStateHash: `sha256:${"d".repeat(64)}`,
    } as const;
    const a = resolveAcegEquipIntent(input);
    const b = resolveAcegEquipIntent(input);
    const changed = resolveAcegEquipIntent({ ...input, inventoryRevisionExact: "9" });
    expect(a.confirmationReceiptId).toBe(b.confirmationReceiptId);
    expect(changed.confirmationReceiptId).not.toBe(a.confirmationReceiptId);
    expect(a.resolution.sourceEvidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(a.resolution.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
