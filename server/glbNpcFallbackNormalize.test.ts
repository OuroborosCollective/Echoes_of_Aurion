import { describe, expect, it } from "vitest";
import { testGlb } from "./glbImportFixtures";
import { buildGlbImportPlan } from "./glbImportPlan";
// @ts-ignore JavaScript CLI helper has no separate declaration file.
import { NPC_FALLBACK_ANIMATIONS, normalizeNpcFallbackGlb, parseGlbBytes } from "../scripts/glb-npc-fallback-normalize.mjs";

function universalFixture() {
  const baseAccessor = { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] };
  return testGlb("Superhero_Female", {
    nodes: [
      { name: "Superhero_Female", mesh: 0 }, { name: "Head" }, { name: "hand_l" }, { name: "hand_r" },
      { name: "upperarm_l" }, { name: "upperarm_r" }, { name: "thigh_l" }, { name: "thigh_r" },
    ],
    skins: [{ name: "Armature", joints: [1] }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 0, byteLength: 36 },
    ],
    accessors: [baseAccessor, { ...baseAccessor, bufferView: 1 }],
    animations: [
      ...NPC_FALLBACK_ANIMATIONS.map((name: string) => ({ name, channels: [], samplers: [] })),
      ...NPC_FALLBACK_ANIMATIONS.map((name: string) => ({ name: `${name}.001`, channels: [], samplers: [] })),
    ],
  });
}

describe("NPC fallback GLB normalization", () => {
  it("drops duplicate clip/accessor baggage while preserving a valid fallback-only import plan", () => {
    const source = universalFixture();
    const normalized = normalizeNpcFallbackGlb(source);
    expect(normalized.originalAnimationCount).toBe(14);
    expect(normalized.animationCount).toBe(7);
    expect(normalized.originalAccessorCount).toBe(2);
    expect(normalized.accessorCount).toBe(1);
    expect(normalized.originalBufferViewCount).toBe(2);
    expect(normalized.bufferViewCount).toBe(1);

    const parsed = parseGlbBytes(normalized.bytes);
    expect(parsed.json.animations.map((animation: { name: string }) => animation.name)).toEqual(NPC_FALLBACK_ANIMATIONS);
    const plan = buildGlbImportPlan(normalized.bytes.toString("base64"), "npc-fallback");
    expect(plan).toMatchObject({ purpose: "npc-fallback", assetType: "character", targetKey: null });
  });
});
