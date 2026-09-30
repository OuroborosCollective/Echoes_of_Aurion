      regionId,
      boneId: value.boneId,
      normalizedBounds: { min: value.min, max: value.max },
      clearanceRadiusNormalized: regionId.startsWith("torso") ? 0.04 : 0.02,
    };
  });

  const sockets = supportedSlots.map(equipmentSlot => ({
    equipmentSlot,
    socketId: `aurion:${equipmentSlot}`,
    boneId: equipmentSlot === "helmet" ? "head" : equipmentSlot === "legs" ? "leg" : equipmentSlot === "boots" ? "foot" : equipmentSlot === "arms" ? "arm" : "root",
    positionNormalized: [0, 0.5, 0] as const,
  })).sort((left, right) => left.equipmentSlot.localeCompare(right.equipmentSlot));

  return createProfile({
    avatarProfileId: id,
    avatarProfileVersion: "aurion-avatar-profile.v1",
    skeletonRevision: sha("s"),
    bones,
    bodyRegions,
    attachmentSockets: sockets,
    normalizedBounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
    armorClearanceEnvelopes: bodyRegions.map(region => ({
      regionId: region.regionId,
      radiusNormalized: region.clearanceRadiusNormalized,
    })),
    supportedEquipmentSlots: [...supportedSlots].sort(),
    surfaceLandmarks: [],
    deformationMode: "rigid",
  });
}

function descriptor(index = 0, overrides: Partial<VisualItemDescriptor> = {}): VisualItemDescriptor {
  const slot = generatedArmorSlots[index % generatedArmorSlots.length]!;
  const seedHex = (index + 1).toString(16).padStart(2, "0");
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId: `armor-heavy-${slot}-fuzz-${index}`,
    familyId: index % 3 === 0 ? "heavy" : index % 3 === 1 ? "light" : "heavy",
    category: "armor",
    equipmentSlot: slot,
    quality: (["normal", "magic", "rare", "set", "unique", "mythic"] as const)[index % 6],
    affixes: index % 4 === 0
      ? [{ id: "affix-sovereign-ember-v2", slot: "prefix", groupId: "sovereign-ember" }]
      : [],
    setId: index % 7 === 0 ? "set-astral-regalia-v2" : null,
    visual: {
      itemDefinitionId: `armor-heavy-${slot}-fuzz-${index}`,
      materialId: visualMaterialIds[index % visualMaterialIds.length]!,
      appearanceId: null,
      materialVariant: null,
      variantTheme: "starforged",
      glbAssetId: null,
    },
    source: {
      lootReceiptId: `fuzz-receipt-${index}`,
      contextHash: sha((index % 16).toString(16)),
      deterministicHash: sha(((index + 1) % 16).toString(16)),
      visualEventIndex: index,
    },
    visualSeed: seedHex.repeat(32),
    ...overrides,
  });
}

function gameplayMarkerKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return gameplayKeys.filter(key => Object.prototype.hasOwnProperty.call(value, key));
}

function assertFiniteObject(value: unknown, label: string): void {
  if (!value || typeof value !== "object") throw new Error(`FUZZ:${label}:not-object`);
  const serialized = JSON.stringify(value);
  if (!serialized || /NaN|Infinity/.test(serialized)) {
    throw new Error(`FUZZ:${label}:non-finite`);
  }
}

function exactCatalogEntry(assetId = "glb_exact_armor", digest = sha("d")): GlbCatalogEntry {
  const entry = {
    assetId,
    sha256: digest,
    displayName: "Equipment · armor · exact",
    assetType: "armor" as const,
    storageUrl: `/api/assets/glb/${digest}.glb`,
    targetKey: null,
    purpose: "equipment" as const,
    subcategory: "armor",
    equipmentSlot: "chest" as const,
  };
  return { ...entry, normalization: glbNormalizationTestFixture(digest) };
}

function catalog(entries: readonly GlbCatalogEntry[]): GlbRuntimeCatalog {
  return {
    version: "aurion.glb-import.v1",
    revision: sha("f"),
    entries: [...entries],
  };
}

describe("AIM-526 Visual Construction Property/Fuzz Suite", () => {
  it("replays a small deterministic seed corpus byte-stably and without gameplay markers", () => {
    for (let index = 0; index < 64; index += 1) {
      const input = descriptor(index);
      const first = compileVisualItemGeometry(input, 0);
      const replay = compileVisualItemGeometry(input, 0);
      expect(first.kind).toBe("generated");
      expect(replay.kind).toBe("generated");
      if (first.kind !== "generated" || replay.kind !== "generated") throw new Error(`FUZZ:${index}:unexpected unsupported geometry`);

      expect(replay.structuralFingerprint).toBe(first.structuralFingerprint);
      expect(replay.morphologyRecipeHash).toBe(first.morphologyRecipeHash);
      expect(gameplayMarkerKeys(first.root.userData.visualItem)).toEqual([]);
      first.root.traverse(node => {
        if ((node as THREE.Mesh).isMesh) expect(gameplayMarkerKeys((node as THREE.Mesh).userData)).toEqual([]);
      });
      assertFiniteObject(first.root.userData.visualItem, `seed-${index}`);

      first.dispose();
      replay.dispose();
    }
  });

  it("keeps morphology identity stable across LODs while geometry identity remains LOD-specific", () => {
    for (let index = 0; index < 12; index += 1) {
      const input = descriptor(index);
      const recipes = lods.map(lod => compileVisualMorphologyRecipe(input));
      expect(new Set(recipes.map(recipe => recipe.recipeHash)).size).toBe(1);

      const outputs = lods.map(lod => compileVisualItemGeometry(input, lod));
      outputs.forEach(result => expect(result.kind).toBe("generated"));
      const generated = outputs.filter((result): result is GeneratedVisualItemGeometry => result.kind === "generated");
      expect(new Set(generated.map(result => result.structuralFingerprint)).size).toBe(3);
      generated.forEach(result => {
        expect(result.root.userData.visualItem).not.toHaveProperty("itemPower");
        result.dispose();
      });
    }
  });

  it("changes only presentation identity when the grammar revision or seed changes", () => {
    const base = descriptor(3);
    const seedVariant = descriptor(3, { visualSeed: sha("e") });
    const grammarVariant = compileVisualMorphologyRecipe(base, VISUAL_MORPHOLOGY_GRAMMAR_VERSION + ".2");
    const baseRecipe = compileVisualMorphologyRecipe(base);
    const seedRecipe = compileVisualMorphologyRecipe(seedVariant);

    expect(seedRecipe.recipeHash).not.toBe(baseRecipe.recipeHash);
    expect(grammarVariant.recipeHash).not.toBe(baseRecipe.recipeHash);
    expect(base.source.deterministicHash).toBe(seedVariant.source.deterministicHash);

    const baseCopy = structuredClone(base);
    compileVisualItemGeometry(base, 0);
    expect(base).toEqual(baseCopy);
  });

  it("accepts every canonical generated armor slot and rejects unsupported slot projections", () => {
    for (const slot of generatedArmorSlots) {
      const item = descriptor(0, {
        itemDefinitionId: `armor-heavy-${slot}-fuzz-slot`,