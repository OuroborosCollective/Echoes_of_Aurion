import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { visualItemDescriptorSchema, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import {
  compileVisualItemGeometry,
  countObjectTriangles,
  generatedArmorSlots,
  visualWeaponFamilies,
  type GeneratedVisualItemGeometry,
  type VisualItemLod,
} from "./VisualItemGeometryCompiler";

const hash = (char: string) => char.repeat(64);
const lods: readonly VisualItemLod[] = [0, 1, 2];

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
    visual: null,
    source: {
      lootReceiptId: "visual-receipt-001",
      contextHash: hash("a"),
      deterministicHash: hash("b"),
      visualEventIndex: 0,
    },
    visualSeed: hash("c"),
    ...overrides,
  });
}

function expectGenerated(result: ReturnType<typeof compileVisualItemGeometry>): GeneratedVisualItemGeometry {
  expect(result.kind).toBe("generated");
  if (result.kind !== "generated") throw new Error(`expected generated geometry, got ${result.reason}`);
  expect(result.triangleCount).toBeGreaterThan(0);
  expect(result.triangleCount).toBe(countObjectTriangles(result.root));
  const bounds = new THREE.Box3().setFromObject(result.root, true);
  expect(bounds.isEmpty()).toBe(false);
  [...bounds.min.toArray(), ...bounds.max.toArray()].forEach(value => expect(Number.isFinite(value)).toBe(true));
  expect(result.structuralFingerprint).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
  return result;
}

describe("VisualItemGeometryCompiler", () => {
  it("generates every confirmed weapon family across all three LODs with measured monotonic triangle budgets", () => {
    for (const familyId of visualWeaponFamilies) {
      const counts: number[] = [];
      for (const lod of lods) {
        const result = expectGenerated(compileVisualItemGeometry(descriptor({
          itemDefinitionId: `weapon-${familyId}-v2`,
          familyId,
          equipmentSlot: familyId === "shield" ? "off_hand" : "main_hand",
        }), lod));
        counts.push(result.triangleCount);
        expect(result.geometryKey).toBe(`weapon:${familyId}`);
        result.dispose();
      }
      expect(counts[0]).toBeGreaterThanOrEqual(counts[1]!);
      expect(counts[1]).toBeGreaterThanOrEqual(counts[2]!);
      expect(counts[0]).toBeGreaterThan(counts[2]!);
    }
  });

  it("generates supported armor slots across LODs without using item stats", () => {
    for (const slot of generatedArmorSlots) {
      const counts: number[] = [];
      for (const lod of lods) {
        const result = expectGenerated(compileVisualItemGeometry(descriptor({
          itemDefinitionId: `armor-heavy-${slot}-v2`,
          familyId: "heavy",
          category: "armor",
          equipmentSlot: slot,
        }), lod));
        counts.push(result.triangleCount);
        const marker = result.root.userData.visualItem as Record<string, unknown>;
        expect(marker.itemDefinitionId).toBe(`armor-heavy-${slot}-v2`);
        expect(marker).not.toHaveProperty("itemPower");
        expect(marker).not.toHaveProperty("baseStats");
        expect(marker).not.toHaveProperty("stats");
        result.dispose();
      }
      expect(counts[0]).toBeGreaterThanOrEqual(counts[1]!);
      expect(counts[1]).toBeGreaterThanOrEqual(counts[2]!);
      expect(counts[0]).toBeGreaterThan(counts[2]!);
    }
  });

  it("fails explicitly for categories and armor slots not owned by this geometry slice", () => {
    for (const category of ["accessory", "focus", "relic", "crafting_component", "shaping_component"] as const) {
      const result = compileVisualItemGeometry(descriptor({ category, equipmentSlot: category === "focus" ? "focus" : null, familyId: "unsupported" }), 0);
      expect(result).toEqual({ kind: "unsupported", lod: 0, reason: "CATEGORY_UNSUPPORTED" });
    }
    expect(compileVisualItemGeometry(descriptor({ category: "armor", familyId: "heavy", equipmentSlot: "belt", itemDefinitionId: "armor-heavy-belt-v2" }), 0))
      .toEqual({ kind: "unsupported", lod: 0, reason: "ARMOR_SLOT_UNSUPPORTED" });
    expect(compileVisualItemGeometry(descriptor({ category: "weapon", familyId: "unknown-family", itemDefinitionId: "weapon-unknown-v2" }), 0))
      .toEqual({ kind: "unsupported", lod: 0, reason: "WEAPON_FAMILY_UNSUPPORTED" });
  });

  it("replays identical descriptors into identical structural fingerprints", () => {
    const input = descriptor({ itemDefinitionId: "weapon-hammer-v2", familyId: "hammer" });
    for (const lod of lods) {
      const first = expectGenerated(compileVisualItemGeometry(input, lod));
      const replay = expectGenerated(compileVisualItemGeometry(input, lod));
      expect(replay.triangleCount).toBe(first.triangleCount);
      expect(replay.structuralFingerprint).toBe(first.structuralFingerprint);
      first.dispose();
      replay.dispose();
    }
  });

  it("disposes every generated geometry and shared placeholder material exactly once", () => {
    const result = expectGenerated(compileVisualItemGeometry(descriptor({ itemDefinitionId: "weapon-axe-v2", familyId: "axe" }), 0));
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    result.root.traverse(node => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      geometries.add(mesh.geometry);
      const values = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      values.forEach(material => materials.add(material));
    });
    const geometrySpies = [...geometries].map(value => vi.spyOn(value, "dispose"));
    const materialSpies = [...materials].map(value => vi.spyOn(value, "dispose"));
    result.dispose();
    geometrySpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    materialSpies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(result.root.children).toHaveLength(0);
  });
});
