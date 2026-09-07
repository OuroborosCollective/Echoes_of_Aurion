import { describe, expect, it } from "vitest";
import type { GlbCatalogEntry, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { visualItemDescriptorSchema, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import { resolveVisualItemRenderSource } from "./VisualItemGlbOverrideResolver";

const sha = (char: string) => char.repeat(64);

function descriptor(overrides: Partial<VisualItemDescriptor> = {}): VisualItemDescriptor {
  const itemDefinitionId = overrides.itemDefinitionId ?? "weapon-spear-v2";
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId,
    familyId: "spear",
    category: "weapon",
    equipmentSlot: "main_hand",
    quality: "rare",
    affixes: [],
    setId: null,
    visual: {
      itemDefinitionId,
      materialId: "star_iron",
      appearanceId: "spear-starforged",
      materialVariant: null,
      variantTheme: "starforged",
      glbAssetId: "glb_exact_weapon",
    },
    source: {
      lootReceiptId: "receipt-001",
      contextHash: sha("a"),
      deterministicHash: sha("b"),
      visualEventIndex: 0,
    },
    visualSeed: sha("c"),
    ...overrides,
  });
}

function entry(overrides: Partial<GlbCatalogEntry> = {}): GlbCatalogEntry {
  const digest = overrides.sha256 ?? sha("d");
  return {
    assetId: "glb_exact_weapon",
    sha256: digest,
    displayName: "Equipment · weapon · Exact Spear",
    assetType: "weapon",
    storageUrl: `/api/assets/glb/${digest}.glb`,
    targetKey: null,
    purpose: "equipment",
    subcategory: "weapon",
    equipmentSlot: "weapon",
    ...overrides,
  };
}

function catalog(entries: GlbCatalogEntry[], revision = sha("f")): GlbRuntimeCatalog {
  return { version: "aurion.glb-import.v1", revision, entries };
}

function expectProcedural(result: ReturnType<typeof resolveVisualItemRenderSource>, reason: string) {
  expect(result.kind).toBe("procedural");
  if (result.kind !== "procedural") throw new Error(`expected procedural source, got ${result.kind}`);
  expect(result.reason).toBe(reason);
  expect(result.geometry.triangleCount).toBeGreaterThan(0);
  return result;
}

describe("VisualItemGlbOverrideResolver", () => {
  it("selects only the exact confirmed equipment asset and returns catalog evidence without invented topology", () => {
    const exact = entry();
    const source = catalog([
      entry({ assetId: "glb_other_weapon", sha256: sha("e"), storageUrl: `/api/assets/glb/${sha("e")}.glb` }),
      exact,
    ]);
    const result = resolveVisualItemRenderSource(descriptor(), 0, source);
    expect(result.kind).toBe("glb");
    if (result.kind !== "glb") throw new Error(`expected glb source, got ${result.kind}`);
    expect(result.entry.assetId).toBe("glb_exact_weapon");
    expect(result.entry).not.toBe(exact);
    expect(Object.isFrozen(result.entry)).toBe(true);
    expect(result.equipmentSlot).toBe("weapon");
    expect(result.catalogRevision).toBe(source.revision);
    expect(result.evidence).toEqual({ assetId: exact.assetId, sha256: exact.sha256, storageUrl: exact.storageUrl, measuredTriangles: null, measuredLod: null });
  });

  it("does not reinterpret the existing slot pool as an exact item binding", () => {
    const input = descriptor({ visual: { itemDefinitionId: "weapon-spear-v2", materialId: "star_iron", appearanceId: null, materialVariant: null, variantTheme: null, glbAssetId: null } });
    const result = expectProcedural(resolveVisualItemRenderSource(input, 1, catalog([
      entry({ assetId: "glb_pool_weapon_a" }),
      entry({ assetId: "glb_pool_weapon_b", sha256: sha("e"), storageUrl: `/api/assets/glb/${sha("e")}.glb` }),
    ])), "NO_CONFIRMED_GLB_BINDING");
    result.geometry.dispose();
  });

  it("maps canonical armor slots to the existing Aurion equipment catalog taxonomy", () => {
    const cases = [
      ["head", "helmet"], ["chest", "chest"], ["hands", "arms"], ["legs", "legs"], ["feet", "boots"],
    ] as const;
    for (const [uiSlot, catalogSlot] of cases) {
      const assetId = `glb_exact_${catalogSlot}`;
      const itemDefinitionId = `armor-heavy-${uiSlot}-v2`;
      const input = descriptor({
        itemDefinitionId,
        familyId: "heavy",
        category: "armor",
        equipmentSlot: uiSlot,
        visual: { itemDefinitionId, materialId: "rustic_iron", appearanceId: null, materialVariant: null, variantTheme: null, glbAssetId: assetId },
      });
      const digest = sha(catalogSlot[0]! === "a" ? "1" : catalogSlot[0]! === "b" ? "2" : catalogSlot[0]! === "c" ? "3" : catalogSlot[0]! === "h" ? "4" : "5");
      const result = resolveVisualItemRenderSource(input, 0, catalog([entry({ assetId, sha256: digest, storageUrl: `/api/assets/glb/${digest}.glb`, assetType: "armor", equipmentSlot: catalogSlot, displayName: `Equipment · ${catalogSlot} · Exact` })]));
      expect(result.kind).toBe("glb");
      if (result.kind === "glb") expect(result.equipmentSlot).toBe(catalogSlot);
    }
  });

  it("fails safely to procedural visuals for missing, foreign-purpose, assigned, wrong-slot, wrong-type and storage-mismatched assets", () => {
    const cases: readonly [string, GlbCatalogEntry[], string][] = [
      ["ASSET_NOT_IN_CATALOG", [entry({ assetId: "glb_other_weapon" })], "ASSET_NOT_IN_CATALOG"],
      ["ASSET_PURPOSE_MISMATCH", [entry({ purpose: "npc-fallback", assetType: "character", equipmentSlot: null, displayName: "NPC Fallback · not equipment" })], "ASSET_PURPOSE_MISMATCH"],
      ["ASSET_TARGET_KEY_FORBIDDEN", [entry({ targetKey: "weapon_spear" })], "ASSET_TARGET_KEY_FORBIDDEN"],
      ["ASSET_SLOT_MISMATCH", [entry({ assetType: "armor", equipmentSlot: "helmet", displayName: "Equipment · helmet · Wrong slot" })], "ASSET_SLOT_MISMATCH"],
      ["ASSET_TYPE_MISMATCH", [entry({ assetType: "armor", equipmentSlot: "weapon", displayName: "Equipment · weapon · Wrong type" })], "ASSET_TYPE_MISMATCH"],
      ["ASSET_STORAGE_MISMATCH", [entry({ storageUrl: `/api/assets/glb/${sha("e")}.glb` })], "ASSET_STORAGE_MISMATCH"],
    ];
    for (const [, entries, expectedReason] of cases) {
      const result = expectProcedural(resolveVisualItemRenderSource(descriptor(), 0, catalog(entries)), expectedReason);
      result.geometry.dispose();
    }
  });

  it("rejects duplicate exact asset ids and malformed catalogs instead of choosing by order", () => {
    const duplicate = entry();
    const ambiguous = expectProcedural(resolveVisualItemRenderSource(descriptor(), 0, catalog([
      duplicate,
      { ...duplicate, sha256: sha("e"), storageUrl: `/api/assets/glb/${sha("e")}.glb` },
    ])), "ASSET_ID_AMBIGUOUS");
    ambiguous.geometry.dispose();

    const malformed = { version: "aurion.glb-import.v1", revision: "not-a-sha", entries: [entry()] } as unknown as GlbRuntimeCatalog;
    const invalid = expectProcedural(resolveVisualItemRenderSource(descriptor(), 0, malformed), "CATALOG_INVALID");
    invalid.geometry.dispose();
  });

  it("resolves the same canonical descriptor and catalog identically regardless of unrelated catalog ordering", () => {
    const exact = entry();
    const other = entry({ assetId: "glb_unrelated", sha256: sha("e"), storageUrl: `/api/assets/glb/${sha("e")}.glb` });
    const first = resolveVisualItemRenderSource(descriptor(), 2, catalog([exact, other]));
    const replay = resolveVisualItemRenderSource(descriptor(), 2, catalog([other, exact]));
    expect(first.kind).toBe("glb");
    expect(replay.kind).toBe("glb");
    if (first.kind === "glb" && replay.kind === "glb") expect(replay.evidence).toEqual(first.evidence);
  });

  it("keeps unsupported item categories explicit even when a catalog contains equipment", () => {
    const itemDefinitionId = "relic-archive-v2";
    const result = resolveVisualItemRenderSource(descriptor({
      itemDefinitionId,
      familyId: "relic",
      category: "relic",
      equipmentSlot: "relic",
      visual: { itemDefinitionId, materialId: null, appearanceId: null, materialVariant: null, variantTheme: null, glbAssetId: "glb_exact_weapon" },
    }), 0, catalog([entry()]));
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") expect(result.geometry.reason).toBe("CATEGORY_UNSUPPORTED");
  });
});
