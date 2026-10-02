import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemManipulationPanel } from "./ItemManipulationPanel";

type Props = Parameters<typeof ItemManipulationPanel>[0];
const readback: Props["readback"] = { recipes: [{ id: "aurion-craft-v2", version: "v2", operation: "craft", allowedCategories: ["weapon"], allowedAffixIds: [], maxAffixSlots: 5, requiredCapability: "personal-workbench", materialRequirements: { "component-craft-star-iron-v2": 2 }, salvageYield: {} }], inventory: { revisionExact: "7", stateHash: `sha256:${"a".repeat(64)}` }, receipts: [] };
function inventory(quantityExact: string): NonNullable<Props["inventory"]> {
  return { version: "aurion-ax1-ui.v1", userId: 7, settings: { revision: 0, autoLoot: true, analyticsConsent: false, hotbar: ["1", "2", "3", "4", "5"], movementMode: "joystick" }, equipment: [], items: [{ id: "iron-stack", version: "aurion_v2", name: "Sterneisen", definition: "component-craft-star-iron-v2", levelExact: "1", quality: "normal", slot: null, status: "owned", stats: {}, receiptId: "confirmed-material", quantityExact, maxQuantityExact: "1000000" }] };
}
describe("server-confirmed item workbench", () => {
  it("disables crafting without enough confirmed materials", () => {
    const onManipulate = vi.fn();
    render(<ItemManipulationPanel readback={readback} inventory={inventory("1")} pending={false} onManipulate={onManipulate} />);
    fireEvent.click(screen.getByRole("button", { name: "Klinge herstellen" }));
    expect(onManipulate).not.toHaveBeenCalled();
    expect(screen.getByText("Es fehlen Materialien.")).toBeTruthy();
  });
  it("sends only intent and revision guards, never client-generated items or stats", () => {
    const onManipulate = vi.fn();
    render(<ItemManipulationPanel readback={readback} inventory={inventory("2")} pending={false} onManipulate={onManipulate} />);
    fireEvent.click(screen.getByRole("button", { name: "Klinge herstellen" }));
    expect(onManipulate).toHaveBeenCalledWith({ recipeId: "aurion-craft-v2", sourceItemId: undefined, materialItemIds: ["iron-stack"], expectedRevisionExact: "7", expectedStateHash: readback!.inventory.stateHash, idempotencyKey: `ui:${"a".repeat(32)}:aurion-craft-v2:craft` });
  });
});
