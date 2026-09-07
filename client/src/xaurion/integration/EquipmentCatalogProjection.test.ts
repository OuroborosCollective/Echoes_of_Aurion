import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { confirmedEquipmentVisualReadbackSchema } from "@shared/confirmedEquipmentVisualProtocol";
import { visualItemDescriptorSchema } from "@shared/visualItemProtocol";
import type { MMOEngine } from "../core/MMOEngine";
import { EquipmentCatalogProjection } from "./EquipmentCatalogProjection";

const sha = (char: string) => char.repeat(64);

function engineWithWeaponAnchor() {
  const glbAvatarGroup = new THREE.Group();
  const anchor = new THREE.Group();
  anchor.name = "socketweaponr";
  glbAvatarGroup.add(anchor);
  const engine = {
    player: { activeGlbModelId: "/api/assets/glb/avatar.glb", glbAvatarGroup },
  } as unknown as MMOEngine;
  return { engine, glbAvatarGroup, anchor };
}

function descriptor(receiptId = "receipt-v2-001") {
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId: "weapon-spear-v2",
    familyId: "spear",
    category: "weapon",
    equipmentSlot: "main_hand",
    quality: "rare",
    affixes: [{ id: "affix-common-might-v2", slot: "prefix", groupId: "common-might" }],
    setId: null,
    visual: null,
    source: { lootReceiptId: receiptId, contextHash: sha("a"), deterministicHash: sha("b"), visualEventIndex: 0 },
    visualSeed: sha("c"),
  });
}

function readback(receiptId = "receipt-v2-001") {
  return confirmedEquipmentVisualReadbackSchema.parse({
    version: "aurion-equipment-visuals.v2",
    userId: 17,
    equipment: [{
      uiSlot: "main_hand",
      equipmentSlot: "weapon",
      itemId: "v2-item-00000001",
      version: "aurion_v2",
      definition: "weapon-spear-v2",
      receiptId,
      visualDescriptor: descriptor(receiptId),
    }],
  });
}

function catalog(): GlbRuntimeCatalog {
  const digest = sha("d");
  return {
    version: "aurion.glb-import.v1",
    revision: sha("f"),
    entries: [{
      assetId: "glb_pool_weapon",
      sha256: digest,
      displayName: "Equipment · weapon · slot pool",
      assetType: "weapon",
      storageUrl: `/api/assets/glb/${digest}.glb`,
      targetKey: null,
      purpose: "equipment",
      subcategory: "weapon",
      equipmentSlot: "weapon",
    }],
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => vi.unstubAllGlobals());

describe("EquipmentCatalogProjection V2 runtime", () => {
  it("uses the receipt-backed visual item compiler instead of the legacy slot pool", async () => {
    const { engine, anchor } = engineWithWeaponAnchor();
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe("/api/game/confirmed-equipment-visuals-v2");
      return new Response(JSON.stringify(readback()), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const projection = new EquipmentCatalogProjection(engine);
    projection.setCatalog(catalog());
    projection.update(0.1, 0);
    await settle();

    const evidence = projection.evidence();
    expect(evidence.confirmed).toBe(1);
    expect(evidence.rendered).toBe(1);
    expect(evidence.slots).toEqual([{ slot: "weapon", source: "visual-item-compiler", receiptId: "receipt-v2-001" }]);
    expect(evidence.v2).toHaveLength(1);
    expect(evidence.v2[0]?.source).toBe("procedural");
    expect(anchor.getObjectByName("aurion-confirmed-equipment:weapon")).toBeTruthy();
    const holder = anchor.getObjectByName("aurion-confirmed-equipment:weapon") as THREE.Group;
    expect((holder.userData.confirmedEquipment as { descriptorHash: string }).descriptorHash).toBe(sha("b"));
    projection.dispose();
  });

  it("keeps the last proven V2 visual through a transient readback failure", async () => {
    const { engine, anchor } = engineWithWeaponAnchor();
    let available = true;
    vi.stubGlobal("fetch", vi.fn(async () => available
      ? new Response(JSON.stringify(readback()), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ error: "temporary" }), { status: 503, headers: { "Content-Type": "application/json" } })));
    const projection = new EquipmentCatalogProjection(engine);
    projection.setCatalog(catalog());
    projection.update(0.1, 0);
    await settle();
    const first = projection.evidence();
    expect(first.rendered).toBe(1);
    available = false;
    projection.update(0.1, 150);
    await settle();
    expect(projection.evidence().slots).toEqual(first.slots);
    expect(anchor.getObjectByName("aurion-confirmed-equipment:weapon")).toBeTruthy();
    projection.dispose();
  });

  it("removes a V2 visual only after a newer proven readback no longer desires its slot", async () => {
    const { engine, anchor } = engineWithWeaponAnchor();
    let body: unknown = readback();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
    const projection = new EquipmentCatalogProjection(engine);
    projection.setCatalog(catalog());
    projection.update(0.1, 0);
    await settle();
    expect(anchor.getObjectByName("aurion-confirmed-equipment:weapon")).toBeTruthy();

    body = { version: "aurion-equipment-visuals.v2", userId: 17, equipment: [] };
    projection.update(0.1, 150);
    await settle();
    expect(projection.evidence().rendered).toBe(0);
    expect(anchor.getObjectByName("aurion-confirmed-equipment:weapon")).toBeUndefined();
    projection.dispose();
  });
});
