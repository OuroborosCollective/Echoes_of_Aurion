import { describe, expect, it } from "vitest";
import type { GlbCatalogEntry, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { publicPlayerCharacterCatalog, selectEquipmentCatalogAsset, uploadedWorldVisualsForChunk } from "./UploadedAssetRuntime";

const sha = (digit: string) => digit.repeat(64);
function entry(values: Partial<GlbCatalogEntry> & Pick<GlbCatalogEntry, "assetId" | "purpose" | "assetType">): GlbCatalogEntry {
  return {
    assetId: values.assetId,
    sha256: values.sha256 ?? sha(values.assetId.slice(-1) || "a"),
    displayName: values.displayName ?? values.assetId,
    assetType: values.assetType,
    storageUrl: values.storageUrl ?? `/api/assets/glb/${values.sha256 ?? sha(values.assetId.slice(-1) || "a")}.glb`,
    targetKey: values.targetKey ?? null,
    purpose: values.purpose,
    subcategory: values.subcategory ?? "test",
    equipmentSlot: values.equipmentSlot ?? null,
  };
}
function catalog(entries: GlbCatalogEntry[], revision = sha("f")): GlbRuntimeCatalog {
  return { version: "aurion.glb-import.v1", revision, entries };
}

describe("uploaded GLB runtime selection", () => {
  it("exposes only the explicitly public once-selectable character lane", () => {
    const result = publicPlayerCharacterCatalog(catalog([
      entry({ assetId: "glb_public_b", purpose: "player-public", assetType: "character" }),
      entry({ assetId: "glb_npc", purpose: "npc-fallback", assetType: "character" }),
      entry({ assetId: "glb_public_a", purpose: "player-public", assetType: "character" }),
      entry({ assetId: "glb_assigned", purpose: "player-public", assetType: "character", targetKey: "starter_player" }),
    ]));
    expect(result.map(value => value.assetId)).toEqual(["glb_public_a", "glb_public_b"]);
  });

  it("selects equipment only inside the confirmed slot and is stable for the same item identity", () => {
    const source = catalog([
      entry({ assetId: "glb_weapon_a", purpose: "equipment", assetType: "weapon", equipmentSlot: "weapon" }),
      entry({ assetId: "glb_weapon_b", purpose: "equipment", assetType: "weapon", equipmentSlot: "weapon" }),
      entry({ assetId: "glb_helmet", purpose: "equipment", assetType: "armor", equipmentSlot: "helmet" }),
      entry({ assetId: "glb_auto_weapon", purpose: "auto", assetType: "weapon", equipmentSlot: "weapon" }),
    ]);
    const first = selectEquipmentCatalogAsset(source, "weapon", "item:sword:receipt:42");
    const second = selectEquipmentCatalogAsset(source, "weapon", "item:sword:receipt:42");
    expect(second?.assetId).toBe(first?.assetId);
    expect(first?.equipmentSlot).toBe("weapon");
    expect(selectEquipmentCatalogAsset(source, "boots", "item:boots:42")).toBeNull();
  });

  it("keeps uploaded world visuals deterministic, purpose-separated and away from the central cross", () => {
    const source = catalog([
      entry({ assetId: "glb_house", purpose: "world-environment", assetType: "arena" }),
      entry({ assetId: "glb_fountain", purpose: "world-environment", assetType: "arena" }),
      entry({ assetId: "glb_tree", purpose: "world-nature", assetType: "arena" }),
      entry({ assetId: "glb_rock", purpose: "world-nature", assetType: "arena" }),
    ]);
    const settlement = uploadedWorldVisualsForChunk(source, { x: 0, z: 0 });
    const repeat = uploadedWorldVisualsForChunk(source, { x: 0, z: 0 });
    expect(repeat).toEqual(settlement);
    expect(settlement.length).toBeGreaterThan(0);
    expect(settlement.every(value => value.asset.purpose === "world-environment")).toBe(true);
    expect(settlement.every(value => Math.abs(value.xMm) >= 24_000 || Math.abs(value.zMm) >= 24_000)).toBe(true);

    const nature = uploadedWorldVisualsForChunk(source, { x: 2, z: 2 });
    expect(nature.length).toBeGreaterThan(0);
    expect(nature.every(value => value.asset.purpose === "world-nature")).toBe(true);
    expect(nature).not.toEqual(settlement);
  });
});
