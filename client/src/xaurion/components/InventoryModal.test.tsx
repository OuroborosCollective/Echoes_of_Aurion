import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerUiReadback } from "@shared/playerUiProtocol";
import { Ax1InventoryModal } from "./Ax1InventoryModal";
import { projectConfirmedAx1Inventory } from "./InventoryModal";

const readback: PlayerUiReadback = {
  version: "aurion-ax1-ui.v1",
  userId: 7,
  settings: { revision: 3, autoLoot: true, analyticsConsent: false, hotbar: ["1", "2", "3", "4", "5"] },
  items: [
    { id: "blade-1", version: "legacy", name: "Confirmed Blade", definition: "blade", levelExact: "12", quality: "rare", slot: "main_hand", status: "owned", stats: { attack: 9 }, receiptId: "receipt-blade" },
    { id: "belt-1", version: "legacy", name: "Confirmed Belt", definition: "belt", levelExact: "4", quality: "magic", slot: "belt", status: "equipped", stats: { armor: 2 }, receiptId: "receipt-belt" },
    { id: "unknown-1", version: "legacy", name: "Unclassified Confirmed Item", definition: "unknown", levelExact: "1", quality: "normal", slot: null, status: "owned", stats: {}, receiptId: "receipt-unknown" },
  ],
  equipment: [{ id: "belt-1", version: "legacy", slot: "belt" }],
};

describe("AX1 inventory authority projection", () => {
  it("projects confirmed slots without fabricating missing AX1 truth", () => {
    const projected = projectConfirmedAx1Inventory(readback)!;
    const blade = projected.items.find(item => item.id === "blade-1")!;
    const belt = projected.items.find(item => item.id === "belt-1")!;
    const unknown = projected.items.find(item => item.id === "unknown-1")!;

    expect(blade.paperdollSlot).toBe("weapon");
    expect(blade.category).toBe("gear");
    expect(belt.paperdollSlot).toBeNull();
    expect(belt.sourceSlot).toBe("belt");
    expect(belt.category).toBe("gear");
    expect(unknown.paperdollSlot).toBeNull();
    expect(unknown.category).toBe("unclassified");
    expect(projected.goldExact).toBeNull();
    expect(projected.gearScoreExact).toBeNull();
    expect(projected.pityCounters).toBeNull();
    expect(projected.silhouetteHarmony).toBeNull();
    expect(projected.aurionResonance).toBeNull();
  });

  it("keeps the cf9 inventory surface visible while unsupported mutations stay disabled", () => {
    const projection = projectConfirmedAx1Inventory(readback)!;
    render(<Ax1InventoryModal
      isOpen
      onClose={vi.fn()}
      projection={projection}
      pending={false}
      onEquip={vi.fn()}
      onUnequip={vi.fn()}
      onCollect={vi.fn()}
      onToggleAutoLoot={vi.fn()}
    />);

    expect(screen.getByRole("dialog", { name: "Inventar & Paperdoll-Rüstkammer" })).toBeTruthy();
    expect(screen.getAllByText("— Gold").length).toBeGreaterThan(0);
    expect(screen.getByText(/Gear Score:/).textContent).toContain("—");
    for (const name of ["Alle", "Rüstung", "Rohstoffe", "Tränke", "Möbel"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getByText("Keine bestätigten Pity-Zähler.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirmed Belt/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirmed Blade · Selten" }));
    expect((screen.getByRole("button", { name: "Verbrauchen" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Verwerfen" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("— Gold").length).toBeGreaterThanOrEqual(2);
  });
});
