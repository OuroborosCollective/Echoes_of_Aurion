import { describe, expect, it } from "vitest";
import { projectConfirmedEquipmentVisuals } from "./glbSmartUpload";

describe("confirmed equipment visual projection", () => {
  it("maps only server-confirmed equipped items into supported GLB attachment slots", () => {
    const ui = {
      version: "aurion-ax1-ui.v1",
      userId: 17,
      settings: { revision: 0, autoLoot: true, analyticsConsent: false, hotbar: ["1", "2", "3", "4", "5"] },
      items: [
        { id: "weapon-1", version: "aurion_v2", name: "Blade", definition: "blade-v2", levelExact: "1", quality: "normal", slot: "main_hand", status: "equipped", stats: { attack: 1 }, receiptId: "receipt-weapon" },
        { id: "helm-1", version: "legacy", name: "Helm", definition: "helm", levelExact: "1", quality: "normal", slot: "head", status: "equipped", stats: {}, receiptId: "receipt-helm" },
        { id: "bag-1", version: "legacy", name: "Bag Item", definition: "bag", levelExact: "1", quality: "normal", slot: "chest", status: "owned", stats: {}, receiptId: "receipt-bag" },
        { id: "ring-1", version: "legacy", name: "Ring", definition: "ring", levelExact: "1", quality: "normal", slot: "ring", status: "equipped", stats: {}, receiptId: "receipt-ring" },
      ],
      equipment: [
        { slot: "main_hand", id: "weapon-1", version: "aurion_v2" },
        { slot: "head", id: "helm-1", version: "legacy" },
        { slot: "chest", id: "bag-1", version: "legacy" },
        { slot: "ring", id: "ring-1", version: "legacy" },
      ],
    } as any;

    expect(projectConfirmedEquipmentVisuals(ui)).toEqual({
      version: "aurion-ax1-ui.v1",
      userId: 17,
      equipment: [
        { uiSlot: "head", equipmentSlot: "helmet", itemId: "helm-1", version: "legacy", definition: "helm", receiptId: "receipt-helm" },
        { uiSlot: "main_hand", equipmentSlot: "weapon", itemId: "weapon-1", version: "aurion_v2", definition: "blade-v2", receiptId: "receipt-weapon" },
      ],
    });
  });

  it("does not invent a shoulder attachment when the authoritative UI has no shoulder slot", () => {
    const ui = { version: "aurion-ax1-ui.v1", userId: 17, settings: {}, items: [], equipment: [] } as any;
    expect(projectConfirmedEquipmentVisuals(ui).equipment.some(entry => entry.equipmentSlot === "shoulders")).toBe(false);
  });
});
