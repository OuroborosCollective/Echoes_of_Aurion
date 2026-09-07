import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { visualItemDescriptorSchema, visualMaterialIds, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import { compileVisualItemGeometry, type GeneratedVisualItemGeometry, type VisualItemLod } from "./VisualItemGeometryCompiler";
import { AurionVisualClock, createVisualItemMaterialBundle, visualElementFamilies, visualItemMaterialProfile } from "./VisualItemMaterialCompiler";

const hash = (char: string) => char.repeat(64);

function descriptor(overrides: Partial<VisualItemDescriptor> = {}): VisualItemDescriptor {
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId: "weapon-spear-v2",
    familyId: "spear",
    category: "weapon",
    equipmentSlot: "main_hand",
    quality: "rare",
    affixes: [],
    setId: null,
    visual: {
      itemDefinitionId: "weapon-spear-v2",
      materialId: "star_iron",
      appearanceId: null,
      materialVariant: null,
      variantTheme: "starforged",
      glbAssetId: null,
    },
    source: {
      lootReceiptId: "visual-receipt-001",
      contextHash: hash("a"),
      deterministicHash: hash("b"),
      visualEventIndex: 0,
    },
    visualSeed: "12345678" + "c".repeat(56),
    ...overrides,
  });
}

function generated(input: VisualItemDescriptor, lod: VisualItemLod): GeneratedVisualItemGeometry {
  const result = compileVisualItemGeometry(input, lod);
  expect(result.kind).toBe("generated");
  if (result.kind !== "generated") throw new Error(result.reason);
  return result;
}

describe("VisualItemMaterialCompiler", () => {
  it("maps every canonical visual material without deriving gameplay state", () => {
    for (const materialId of visualMaterialIds) {
      const input = descriptor({ visual: { itemDefinitionId: "weapon-spear-v2", materialId, appearanceId: null, materialVariant: null, variantTheme: null, glbAssetId: null } });
      const profile = visualItemMaterialProfile(input, 0);
      expect(profile.materialId).toBe(materialId);
      expect(profile.materialSource).toBe("confirmed");
      expect(profile.maxDrawPassesPerMesh).toBe(1);
      expect(profile).not.toHaveProperty("itemPower");
      expect(profile).not.toHaveProperty("baseStats");
      expect(profile).not.toHaveProperty("stats");
    }
    expect(visualItemMaterialProfile(descriptor({ visual: null }), 0)).toMatchObject({ materialId: "rustic_iron", materialSource: "fallback" });
  });

  it("selects presentation-only elemental families from confirmed affix identities", () => {
    for (const element of visualElementFamilies) {
      const profile = visualItemMaterialProfile(descriptor({ affixes: [{ id: `affix-sovereign-${element}-v2`, slot: "prefix", groupId: `sovereign-${element}` }] }), 0);
      expect(profile.element).toBe(element);
      expect(profile.animatedEffect).toBe(true);
    }
    expect(visualItemMaterialProfile(descriptor({ affixes: [{ id: "affix-refined-reach-v2", slot: "suffix", groupId: "refined-reach" }] }), 0).element).toBeNull();
  });

  it("degrades material complexity by LOD while keeping one draw pass per mesh", () => {
    const input = descriptor({ quality: "mythic", setId: "set-astral-regalia-v2", affixes: [{ id: "affix-sovereign-gale-v2", slot: "prefix", groupId: "sovereign-gale" }] });
    const clock = new AurionVisualClock();
    const lod0 = createVisualItemMaterialBundle(input, 0, clock);
    const lod1 = createVisualItemMaterialBundle(input, 1, clock);
    const lod2 = createVisualItemMaterialBundle(input, 2, clock);
    expect(lod0.primary).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(lod0.profile).toMatchObject({ materialTier: "physical", materialCount: 2, animatedEffect: true, maxDrawPassesPerMesh: 1, setActive: true });
    expect(lod1.primary).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(lod1.profile).toMatchObject({ materialTier: "standard", materialCount: 2, animatedEffect: false, maxDrawPassesPerMesh: 1 });
    expect(lod2.primary).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(lod2.primary).toBe(lod2.accent);
    expect(lod2.profile).toMatchObject({ materialTier: "lambert", materialCount: 1, animatedEffect: false, maxDrawPassesPerMesh: 1 });
    lod0.dispose(); lod1.dispose(); lod2.dispose();
  });

  it("binds animated LOD0 materials to an external visual clock without advancing it per item", () => {
    const input = descriptor({ affixes: [{ id: "affix-exalted-ember-v2", slot: "prefix", groupId: "exalted-ember" }] });
    const clock = new AurionVisualClock();
    clock.reset(7);
    const first = createVisualItemMaterialBundle(input, 0, clock);
    const second = createVisualItemMaterialBundle(input, 0, clock);
    expect(clock.uniform.value).toBe(7);
    expect(first.clockUniform).toBe(clock.uniform);
    expect(second.clockUniform).toBe(clock.uniform);
    expect((first.primary.userData.aurionAnimatedVfx as { clockDriven?: boolean }).clockDriven).toBe(true);
    expect(() => clock.advance(Number.NaN)).toThrow(/finite/i);
    expect(() => clock.advance(-1)).toThrow(/non-negative/i);
    expect(clock.advance(0.5)).toBe(7.5);
    first.dispose(); second.dispose();
  });

  it("applies at most two owned materials without changing geometry evidence or gameplay markers", () => {
    const input = descriptor({ quality: "set", setId: "set-astral-regalia-v2" });
    const asset = generated(input, 0);
    const triangleCount = asset.triangleCount;
    const fingerprint = asset.structuralFingerprint;
    const clock = new AurionVisualClock();
    const bundle = createVisualItemMaterialBundle(input, 0, clock);
    const applied = bundle.apply(asset);
    expect(applied).toBeGreaterThan(0);
    expect(asset.triangleCount).toBe(triangleCount);
    expect(asset.structuralFingerprint).toBe(fingerprint);
    expect(asset.root.userData.visualMaterial).toEqual(bundle.profile);
    expect(asset.root.userData.visualMaterial).not.toHaveProperty("itemPower");
    const used = new Set<THREE.Material>();
    asset.root.traverse(node => { if ((node as THREE.Mesh).isMesh) used.add((node as THREE.Mesh).material as THREE.Material); });
    expect(used.size).toBeLessThanOrEqual(2);
    bundle.dispose();
    asset.dispose();
  });

  it("keeps material and geometry disposal ownership separate", () => {
    const input = descriptor();
    const asset = generated(input, 0);
    const geometries: THREE.BufferGeometry[] = [];
    asset.root.traverse(node => { if ((node as THREE.Mesh).isMesh) geometries.push((node as THREE.Mesh).geometry); });
    const geometrySpies = geometries.map(value => vi.spyOn(value, "dispose"));
    const bundle = createVisualItemMaterialBundle(input, 0, new AurionVisualClock());
    const primarySpy = vi.spyOn(bundle.primary, "dispose");
    const accentSpy = bundle.accent === bundle.primary ? primarySpy : vi.spyOn(bundle.accent, "dispose");
    bundle.apply(asset);
    bundle.dispose();
    expect(primarySpy).toHaveBeenCalledTimes(1);
    if (accentSpy !== primarySpy) expect(accentSpy).toHaveBeenCalledTimes(1);
    geometrySpies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    asset.dispose();
    geometrySpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(primarySpy).toHaveBeenCalledTimes(1);
    if (accentSpy !== primarySpy) expect(accentSpy).toHaveBeenCalledTimes(1);
  });
});
