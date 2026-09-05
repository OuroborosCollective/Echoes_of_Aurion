import { describe, expect, it } from "vitest";
import { controlSettingsSchema, defaultHotbar, PLAYER_UI_VERSION, playerUiReadbackSchema, shouldAutoCollect } from "../shared/playerUiProtocol";

describe("AX1 controls and confirmed paperdoll contract", () => {
  it("accepts five distinct server commands and rejects invented, repeated or authority-bearing settings", () => {
    const settings = { revision: 0, autoLoot: true, hotbar: defaultHotbar };
    expect(controlSettingsSchema.parse(settings)).toEqual(settings);
    for (const invalid of [{ ...settings, hotbar: ["1", "1", "2", "3", "4"] }, { ...settings, hotbar: ["F", "2", "3", "4", "5"] }, { ...settings, userId: 8 }, { ...settings, revision: -1 }]) expect(controlSettingsSchema.safeParse(invalid).success).toBe(false);
  });
  it("automatically collects only common/magic drops while respecting disabled auto-loot", () => {
    for (const quality of ["normal", "magic", "rare", "set", "unique", "mythic", "unknown"]) {
      expect(shouldAutoCollect(quality, true)).toBe(["normal", "magic"].includes(quality));
      expect(shouldAutoCollect(quality, false)).toBe(false);
    }
  });
  it("rejects missing, duplicated and contradictory equipment or provenance", () => {
    const item = { id: "fixture_item", version: "legacy", name: "Aurionspeer", definition: "aurion_spear", levelExact: "1", quality: "normal", slot: "main_hand", status: "equipped", stats: {}, receiptId: "fixture_receipt" };
    const slot = { id: item.id, version: item.version, slot: item.slot };
    const state = { version: PLAYER_UI_VERSION, userId: 1, settings: { revision: 0, autoLoot: true, hotbar: defaultHotbar }, items: [item], equipment: [slot] };
    expect(playerUiReadbackSchema.safeParse(state).success).toBe(true);
    for (const invalid of [{ ...state, equipment: [] }, { ...state, items: [] }, { ...state, items: [item, item] }, { ...state, equipment: [slot, slot] }, { ...state, equipment: [{ ...slot, version: "aurion_v2" }] }, { ...state, items: [{ ...item, receiptId: null }] }, { ...state, items: [{ ...item, status: "owned" }] }]) expect(playerUiReadbackSchema.safeParse(invalid).success).toBe(false);
  });
});
