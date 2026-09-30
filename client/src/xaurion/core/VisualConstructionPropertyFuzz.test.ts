import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  canonicalAvatarBodyRegionIds,
  createCanonicalAvatarProfile,
  type CanonicalAvatarProfileInput,
} from "@shared/aurionCanonicalAvatarContract";
import type { GlbCatalogEntry, GlbEquipmentSlot, GlbRuntimeCatalog } from "@shared/glbImportContract";
import { visualItemDescriptorSchema, visualMaterialIds, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import { AnimatedGlbActor } from "./AnimatedGlbActor";
import { createCanonicalAvatarProfile as createProfile } from "@shared/aurionCanonicalAvatarContract";
import { VisualConstructionRuntimeCache, visualConstructionCacheKey } from "./VisualConstructionRuntimeCache";
import { compileEquipmentSkinning } from "./EquipmentSkinningCompiler";
import { fitGeneratedEquipment } from "./EquipmentFitCompiler";
import {
  compileVisualItemGeometry,
  generatedArmorSlots,
  type GeneratedVisualItemGeometry,
  type VisualItemLod,
} from "./VisualItemGeometryCompiler";
import {
  compileVisualMorphologyRecipe,
  VISUAL_MORPHOLOGY_GRAMMAR_VERSION,
} from "./VisualItemMorphologyCompiler";
import { AurionVisualClock, createVisualItemMaterialBundle, visualItemMaterialProfile } from "./VisualItemMaterialCompiler";
import { resolveVisualItemRenderSource } from "./VisualItemGlbOverrideResolver";
import { VisualItemAttachmentController } from "./VisualItemAttachmentController";
import { glbNormalizationTestFixture } from "./GlbNormalizationTestFixture.test";

const sha = (char: string) => char.repeat(64);
const lods: readonly VisualItemLod[] = [0, 1, 2];
const gameplayKeys = [
  "itemPower",
  "baseStats",
  "stats",
  "damage",
  "armor",
  "inventoryId",
  "ownership",
] as const;

const regionBounds: Readonly<Record<(typeof canonicalAvatarBodyRegionIds)[number], {
  boneId: string;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}>> = Object.freeze({
  head: { boneId: "head", min: [-0.12, 0.80, -0.12], max: [0.12, 0.98, 0.12] },
  neck: { boneId: "head", min: [-0.08, 0.72, -0.08], max: [0.08, 0.84, 0.08] },
  torso_front: { boneId: "root", min: [-0.28, 0.34, -0.16], max: [0.28, 0.70, 0.16] },
  torso_back: { boneId: "root", min: [-0.28, 0.34, -0.16], max: [0.28, 0.70, 0.16] },
  shoulder_left: { boneId: "arm", min: [-0.42, 0.60, -0.12], max: [-0.18, 0.78, 0.12] },
  shoulder_right: { boneId: "arm", min: [0.18, 0.60, -0.12], max: [0.42, 0.78, 0.12] },
  upper_arm_left: { boneId: "arm", min: [-0.40, 0.42, -0.10], max: [-0.22, 0.62, 0.10] },
  upper_arm_right: { boneId: "arm", min: [0.22, 0.42, -0.10], max: [0.40, 0.62, 0.10] },
  forearm_left: { boneId: "arm", min: [-0.38, 0.22, -0.09], max: [-0.24, 0.46, 0.09] },
  forearm_right: { boneId: "arm", min: [0.24, 0.22, -0.09], max: [0.38, 0.46, 0.09] },
  hand_left: { boneId: "hand", min: [-0.39, 0.46, -0.07], max: [-0.25, 0.58, 0.07] },
  hand_right: { boneId: "hand", min: [0.25, 0.46, -0.07], max: [0.39, 0.58, 0.07] },
  thigh_left: { boneId: "leg", min: [-0.22, 0.24, -0.11], max: [-0.05, 0.48, 0.11] },
  thigh_right: { boneId: "leg", min: [0.05, 0.24, -0.11], max: [0.22, 0.48, 0.11] },
  shin_left: { boneId: "leg", min: [-0.20, 0.06, -0.10], max: [-0.06, 0.30, 0.10] },
  shin_right: { boneId: "leg", min: [0.06, 0.06, -0.10], max: [0.20, 0.30, 0.10] },
  foot_left: { boneId: "foot", min: [-0.23, 0.00, -0.18], max: [-0.03, 0.10, 0.18] },
  foot_right: { boneId: "foot", min: [0.03, 0.00, -0.18], max: [0.23, 0.10, 0.18] },
});

function canonicalProfile(id: string, supportedSlots: readonly GlbEquipmentSlot[] = ["arms", "boots", "chest", "helmet", "legs"]): ReturnType<typeof createCanonicalAvatarProfile> {
  const bones = [
    { boneId: "arm", sourceName: "arm", parentBoneId: "root", restPositionNormalized: [0, 0.48, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
    { boneId: "foot", sourceName: "foot", parentBoneId: "root", restPositionNormalized: [0, 0.08, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
    { boneId: "hand", sourceName: "hand", parentBoneId: "arm", restPositionNormalized: [0, 0.52, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
    { boneId: "head", sourceName: "head", parentBoneId: "root", restPositionNormalized: [0, 0.90, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
    { boneId: "leg", sourceName: "leg", parentBoneId: "root", restPositionNormalized: [0, 0.34, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
    { boneId: "root", sourceName: "root", parentBoneId: null, restPositionNormalized: [0, 0, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
  ].sort((left, right) => left.boneId.localeCompare(right.boneId));

  const bodyRegions = canonicalAvatarBodyRegionIds.map(regionId => {
    const value = regionBounds[regionId];
    return {
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
    const seedVariant = descriptor(3, { visualSeed: sha("z") });
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
        equipmentSlot: slot,
      });
      const result = compileVisualItemGeometry(item, 0);
      expect(result.kind).toBe("generated");
      if (result.kind === "generated") result.dispose();
    }
    const unsupported = descriptor(0, { equipmentSlot: "belt" });
    expect(compileVisualItemGeometry(unsupported, 0)).toEqual({
      kind: "unsupported",
      lod: 0,
      reason: "ARMOR_SLOT_UNSUPPORTED",
    });
  });

  it("fails closed on zero/negative fit dimensions and keeps finite negative-scale render geometry deterministic", () => {
    const profile = canonicalProfile("fit-fuzz");
    const input = descriptor(1, { equipmentSlot: "chest" });
    const geometry = compileVisualItemGeometry(input, 0);
    if (geometry.kind !== "generated") throw new Error("FUZZ:fit:unsupported");

    expect(() => fitGeneratedEquipment(input, geometry, profile, 0)).toThrow("EQUIPMENT_FIT_AVATAR_HEIGHT_INVALID");
    expect(() => fitGeneratedEquipment(input, geometry, profile, -1)).toThrow("EQUIPMENT_FIT_AVATAR_HEIGHT_INVALID");

    const negativeA = compileVisualItemGeometry(input, 0);
    const negativeB = compileVisualItemGeometry(input, 0);
    if (negativeA.kind !== "generated" || negativeB.kind !== "generated") throw new Error("FUZZ:negative-scale:unsupported");
    negativeA.root.scale.setScalar(-1);
    negativeB.root.scale.setScalar(-1);
    const boxA = new THREE.Box3().setFromObject(negativeA.root, true);
    const boxB = new THREE.Box3().setFromObject(negativeB.root, true);
    expect(boxA.isEmpty()).toBe(false);
    expect(boxA.min.toArray()).toEqual(boxB.min.toArray());
    expect(boxA.max.toArray()).toEqual(boxB.max.toArray());
    [...boxA.min.toArray(), ...boxA.max.toArray()].forEach(value => expect(Number.isFinite(value)).toBe(true));
    geometry.dispose();
    negativeA.dispose();
    negativeB.dispose();
  });

  it("binds avatar fit to canonical profile changes and keeps loot identity untouched", () => {
    const input = descriptor(1, { equipmentSlot: "chest", itemDefinitionId: "armor-heavy-chest-fuzz-fit" });
    const profileA = canonicalProfile("fit-a");
    const { protocol: _protocol, profileFingerprint: _fingerprint, ...profileBInput } = profileA;
    const profileB = createCanonicalAvatarProfile({
      ...profileBInput,
      avatarProfileId: "fit-b",
      bodyRegions: profileA.bodyRegions.map(region => region.regionId === "torso_front"
        ? { ...region, normalizedBounds: { min: [-0.32, 0.30, -0.18], max: [0.32, 0.72, 0.18] } }
        : region),
    });

    const geometryA = compileVisualItemGeometry(input, 0);
    const geometryB = compileVisualItemGeometry(input, 0);
    if (geometryA.kind !== "generated" || geometryB.kind !== "generated") throw new Error("FUZZ:fit-profile:unsupported");

    const fitA = fitGeneratedEquipment(input, geometryA, profileA, 2.0);
    const fitB = fitGeneratedEquipment(input, geometryB, profileB, 2.0);
    expect(fitA.fitFingerprint).not.toBe(fitB.fitFingerprint);
    expect(fitA.descriptorHash).toBe(input.source.deterministicHash);
    expect(fitB.descriptorHash).toBe(input.source.deterministicHash);
    expect(input.source.deterministicHash).toBe(fitA.descriptorHash);
    expect(fitA.clearanceBasisPoints).toBeGreaterThanOrEqual(0);
    expect(fitB.clearanceBasisPoints).toBeGreaterThanOrEqual(0);
    assertFiniteObject(fitA, "fit-a");
    assertFiniteObject(fitB, "fit-b");

    geometryA.dispose();
    geometryB.dispose();
  });

  it("keeps material parameters bounded and detached from gameplay identity across the canonical material set", () => {
    for (const materialId of visualMaterialIds) {
      const input = descriptor(5, {
        visual: {
          itemDefinitionId: "armor-heavy-feet-fuzz-material",
          materialId,
          appearanceId: null,
          materialVariant: null,
          variantTheme: null,
          glbAssetId: null,
        },
      });
      for (const lod of lods) {
        const profile = visualItemMaterialProfile(input, lod);
        expect(profile.maxDrawPassesPerMesh).toBe(1);
        expect(profile.materialCount).toBeLessThanOrEqual(2);
        expect(profile.materialCount).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(profile.visualPhase)).toBe(true);
        expect(gameplayMarkerKeys(profile)).toEqual([]);
        const geometry = compileVisualItemGeometry(input, lod);
        if (geometry.kind !== "generated") throw new Error(`FUZZ:material:${materialId}:lod${lod}`);
        const bundle = createVisualItemMaterialBundle(input, lod, new AurionVisualClock());
        bundle.apply(geometry);
        geometry.root.traverse(node => {
          if (!(node as THREE.Mesh).isMesh) return;
          const materials = Array.isArray((node as THREE.Mesh).material)
            ? (node as THREE.Mesh).material as THREE.Material[]
            : [(node as THREE.Mesh).material as THREE.Material];
          materials.forEach(material => {
            expect(Number.isFinite((material as THREE.Material).opacity)).toBe(true);
            expect(gameplayMarkerKeys(material.userData)).toEqual([]);
          });
        });
        bundle.dispose();
        geometry.dispose();
      }
    }
  });

  it("preserves GLB precedence and rejects a duplicate exact binding without inventing identity", () => {
    const base = descriptor(1, {
      itemDefinitionId: "armor-heavy-chest-fuzz-glb",
      equipmentSlot: "chest",
      visual: {
        itemDefinitionId: "armor-heavy-chest-fuzz-glb",
        materialId: "star_iron",
        appearanceId: null,
        materialVariant: null,
        variantTheme: "starforged",
        glbAssetId: "glb_exact_armor",
      },
    });
    const exact = exactCatalogEntry();
    const exactResult = resolveVisualItemRenderSource(base, 0, catalog([exact]));
    expect(exactResult.kind).toBe("glb");
    if (exactResult.kind === "glb") {
      expect(exactResult.entry.assetId).toBe(exact.assetId);
      expect(exactResult.equipmentSlot).toBe("chest");
    }

    const procedural = resolveVisualItemRenderSource({ ...base, visual: null }, 0, catalog([exact]));
    expect(procedural.kind).toBe("procedural");
    if (procedural.kind === "procedural") procedural.geometry.dispose();

    const ambiguous = resolveVisualItemRenderSource(base, 0, catalog([
      exact,
      exactCatalogEntry("glb_exact_armor", sha("e")),
    ]));
    expect(ambiguous.kind).toBe("procedural");
    if (ambiguous.kind === "procedural") {
      expect(ambiguous.reason).toBe("ASSET_ID_AMBIGUOUS");
      ambiguous.geometry.dispose();
    }
  });

  it("uses the runtime-generated presentation path through a real AnimatedGlbActor anchor", async () => {
    const model = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.8, 0.35),
      new THREE.MeshBasicMaterial(),
    );
    bodyMesh.position.y = 0.9;
    model.add(bodyMesh);
    const anchor = new THREE.Group();
    anchor.name = "socketchest";
    model.add(anchor);
    const actor = new AnimatedGlbActor(model, [], 2);
    const controller = new VisualItemAttachmentController(actor, new AurionVisualClock());
    const item = descriptor(1, {
      itemDefinitionId: "armor-heavy-chest-runtime-fuzz",
      equipmentSlot: "chest",
      visual: null,
    });

    const first = await controller.apply(item, 0, catalog([]));
    const second = await controller.apply(item, 0, catalog([]));
    expect(first).toMatchObject({ status: "attached", source: "procedural", slot: "chest" });
    expect(second).toMatchObject({ status: "attached", source: "procedural", slot: "chest" });
    expect(controller.constructionCacheEvidence()).toMatchObject({
      size: 1,
      hits: 1,
      misses: 1,
      evictions: 0,
    });
    expect(actor.evidence().equipmentSlots).toEqual(["chest"]);
    controller.dispose();
    expect(controller.constructionCacheEvidence().size).toBe(0);
    actor.dispose();
  });

  it("checks cache eviction and reconstruction equivalence over a canonical corpus", () => {
    const cache = new VisualConstructionRuntimeCache<string>(3);
    const keys = Array.from({ length: 8 }, (_, index) => visualConstructionCacheKey({
      descriptorHash: sha(String.fromCharCode(97 + index)),
      grammarVersion: VISUAL_MORPHOLOGY_GRAMMAR_VERSION,
      avatarProfileVersion: "aurion-avatar-profile.v1",
      fitVersion: "aurion-equipment-fit.v1",
      lod: (index % 3) as 0 | 1 | 2,
    }));

    const outputs = keys.map((key, index) => cache.getOrCreate(key, () => `recipe-${index}`));
    expect(outputs).toEqual(keys.map((_, index) => `recipe-${index}`));
    expect(cache.stats()).toMatchObject({ size: 3, misses: 8, evictions: 5 });

    const rebuilt = cache.getOrCreate(keys[0]!, () => "recipe-0");
    expect(rebuilt).toBe("recipe-0");
    expect(cache.stats().misses).toBe(9);
  });

  it("keeps skinning and presentation separation explicit when a canonical skinned avatar is supplied", () => {
    const input = descriptor(1, {
      itemDefinitionId: "armor-heavy-chest-skinning-fuzz",
      equipmentSlot: "chest",
    });
    const geometry = compileVisualItemGeometry(input, 0);
    if (geometry.kind !== "generated") throw new Error("FUZZ:skinning:unsupported");
    const profile = createCanonicalAvatarProfile({
      ...canonicalProfile("skinning-fuzz"),
      deformationMode: "skinned",
    });

    const avatarRoot = new THREE.Group();
    const body = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(0.6, 1.8, 0.35),
      new THREE.MeshBasicMaterial(),
    );
    const bone = new THREE.Bone();
    bone.name = "root";
    const arm = new THREE.Bone();
    arm.name = "arm";
    bone.add(arm);
    const hand = new THREE.Bone();
    hand.name = "hand";
    arm.add(hand);
    const head = new THREE.Bone();
    head.name = "head";
    bone.add(head);
    const leg = new THREE.Bone();
    leg.name = "leg";
    bone.add(leg);
    const foot = new THREE.Bone();
    foot.name = "foot";
    bone.add(foot);
    const skeleton = new THREE.Skeleton([bone, arm, hand, head, leg, foot]);
    body.add(bone);
    body.bind(skeleton);
    avatarRoot.add(body);
    avatarRoot.updateMatrixWorld(true);

    const contract = compileEquipmentSkinning(input, geometry.root, geometry.morphologyRecipeHash, avatarRoot, profile, 2.0);
    expect(contract).not.toBeNull();
    if (contract) {
      expect(contract.maxInfluences).toBe(4);
      expect(contract.weightQuantizationUnits).toBe(65535);
      expect(contract.vertexCount).toBeGreaterThan(0);
      expect(contract.weightFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(contract.skinningFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(gameplayMarkerKeys(contract)).toEqual([]);
    }
    geometry.dispose();
    avatarRoot.traverse(node => {
      if ((node as THREE.Mesh).isMesh) {
        (node as THREE.Mesh).geometry.dispose();
        (Array.isArray((node as THREE.Mesh).material) ? (node as THREE.Mesh).material : [(node as THREE.Mesh).material]).forEach(material => material.dispose());
      }
    });
  });
});