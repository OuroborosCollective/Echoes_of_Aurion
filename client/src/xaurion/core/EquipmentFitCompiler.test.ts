import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createCanonicalAvatarProfile,
  type CanonicalAvatarProfileInput,
} from "@shared/aurionCanonicalAvatarContract";
import { visualItemDescriptorSchema, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import { compileVisualItemGeometry } from "./VisualItemGeometryCompiler";
import { fitGeneratedEquipment } from "./EquipmentFitCompiler";

const sha = (char: string) => char.repeat(64);

function profileInput(id: string, scale = 1): CanonicalAvatarProfileInput {
  const bones = [
    ["arm", "arm", [0, 0.48 * scale, 0], "root"],
    ["foot", "foot", [0, 0.08 * scale, 0], "root"],
    ["hand", "hand", [0, 0.52 * scale, 0], "arm"],
    ["head", "head", [0, 0.9 * scale, 0], "root"],
    ["leg", "leg", [0, 0.34 * scale, 0], "root"],
    ["root", "root", [0, 0, 0], null],
  ] as const;
  const boneRecords = bones.map(([boneId, sourceName, position, parentBoneId]) => ({
    boneId,
    sourceName,
    parentBoneId,
    restPositionNormalized: position,
    restQuaternion: [0, 0, 0, 1] as const,
  })).sort((left, right) => left.boneId < right.boneId ? -1 : left.boneId > right.boneId ? 1 : 0);

  const region = (
    regionId: any,
    boneId: string,
    min: [number, number, number],
    max: [number, number, number],
    clearance = 0.02,
  ) => ({ regionId, boneId, normalizedBounds: { min, max }, clearanceRadiusNormalized: clearance });

  const bodyRegions = [
    region("head", "head", [-0.12, 0.80, -0.12], [0.12, 0.98, 0.12], 0.03),
    region("neck", "head", [-0.08, 0.74, -0.08], [0.08, 0.84, 0.08]),
    region("torso_front", "root", [-0.28, 0.34, -0.16], [0.28, 0.70, 0.16], 0.04),
    region("torso_back", "root", [-0.28, 0.34, -0.16], [0.28, 0.70, 0.16], 0.04),
    region("shoulder_left", "arm", [-0.42, 0.60, -0.12], [-0.18, 0.78, 0.12]),
    region("shoulder_right", "arm", [0.18, 0.60, -0.12], [0.42, 0.78, 0.12]),
    region("upper_arm_left", "arm", [-0.40, 0.42, -0.10], [-0.22, 0.62, 0.10]),
    region("upper_arm_right", "arm", [0.22, 0.42, -0.10], [0.40, 0.62, 0.10]),
    region("forearm_left", "arm", [-0.38, 0.22, -0.09], [-0.24, 0.46, 0.09]),
    region("forearm_right", "arm", [0.24, 0.22, -0.09], [0.38, 0.46, 0.09]),
    region("hand_left", "hand", [-0.39, 0.46, -0.07], [-0.25, 0.58, 0.07]),
    region("hand_right", "hand", [0.25, 0.46, -0.07], [0.39, 0.58, 0.07]),
    region("thigh_left", "leg", [-0.22, 0.24, -0.11], [-0.05, 0.48, 0.11]),
    region("thigh_right", "leg", [0.05, 0.24, -0.11], [0.22, 0.48, 0.11]),
    region("shin_left", "leg", [-0.20, 0.06, -0.10], [-0.06, 0.30, 0.10]),
    region("shin_right", "leg", [0.06, 0.06, -0.10], [0.20, 0.30, 0.10]),
    region("foot_left", "foot", [-0.23, 0.00, -0.18], [-0.03, 0.10, 0.18]),
    region("foot_right", "foot", [0.03, 0.00, -0.18], [0.23, 0.10, 0.18]),
  ].sort((left, right) => left.regionId < right.regionId ? -1 : left.regionId > right.regionId ? 1 : 0);

  return {
    avatarProfileId: id,
    avatarProfileVersion: "aurion-avatar-profile.v1",
    skeletonRevision: sha("a"),
    bones: boneRecords,
    bodyRegions,
    attachmentSockets: [
      { equipmentSlot: "arms", socketId: "aurion:arms", boneId: "arm", positionNormalized: [0, 0.48, 0] },
      { equipmentSlot: "boots", socketId: "aurion:boots", boneId: "foot", positionNormalized: [0, 0.05, 0] },
      { equipmentSlot: "chest", socketId: "aurion:chest", boneId: "root", positionNormalized: [0, 0.52, 0] },
      { equipmentSlot: "helmet", socketId: "aurion:helmet", boneId: "head", positionNormalized: [0, 0.90, 0] },
      { equipmentSlot: "legs", socketId: "aurion:legs", boneId: "leg", positionNormalized: [0, 0.30, 0] },
    ].sort((left, right) => left.equipmentSlot < right.equipmentSlot ? -1 : left.equipmentSlot > right.equipmentSlot ? 1 : 0),
    normalizedBounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
    armorClearanceEnvelopes: bodyRegions.map(value => ({
      regionId: value.regionId,
      radiusNormalized: value.clearanceRadiusNormalized,
    })),
    supportedEquipmentSlots: ["arms", "boots", "chest", "helmet", "legs"],
    surfaceLandmarks: [
      { landmarkId: "foot_left", boneId: "foot", positionNormalized: [-0.13, 0.05, 0] },
      { landmarkId: "foot_right", boneId: "foot", positionNormalized: [0.13, 0.05, 0] },
      { landmarkId: "hand_left", boneId: "hand", positionNormalized: [-0.32, 0.52, 0] },
      { landmarkId: "hand_right", boneId: "hand", positionNormalized: [0.32, 0.52, 0] },
      { landmarkId: "head", boneId: "head", positionNormalized: [0, 0.90, 0] },
    ].sort((left, right) => left.landmarkId < right.landmarkId ? -1 : left.landmarkId > right.landmarkId ? 1 : 0),
    deformationMode: "rigid",
  };
}

function armorDescriptor(overrides: Partial<VisualItemDescriptor> = {}): VisualItemDescriptor {
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId: "armor-chest-v2",
    familyId: "heavy",
    category: "armor",
    equipmentSlot: "chest",
    quality: "rare",
    affixes: [],
    setId: null,
    visual: null,
    source: {
      lootReceiptId: "fit-receipt",
      contextHash: sha("b"),
      deterministicHash: sha("c"),
      visualEventIndex: 0,
    },
    visualSeed: sha("d"),
    ...overrides,
  });
}

describe("EquipmentFitCompiler", () => {
  it("produces the same quantized fit for the same descriptor and avatar profile", () => {
    const descriptor = armorDescriptor();
    const profile = createCanonicalAvatarProfile(profileInput("avatar-a"));
    const first = compileVisualItemGeometry(descriptor, 0);
    const second = compileVisualItemGeometry(descriptor, 0);
    expect(first.kind).toBe("generated");
    expect(second.kind).toBe("generated");
    if (first.kind !== "generated" || second.kind !== "generated") throw new Error("expected generated geometry");

    const fitA = fitGeneratedEquipment(descriptor, first, profile);
    const fitB = fitGeneratedEquipment(descriptor, second, profile);

    expect(fitA.fitFingerprint).toBe(fitB.fitFingerprint);
    expect(fitA.scaleBasisPoints).toBe(fitB.scaleBasisPoints);
    expect(fitA.translationMillimeters).toEqual(fitB.translationMillimeters);
    expect(first.root.position.toArray()).toEqual(second.root.position.toArray());
    expect(first.root.scale.toArray()).toEqual(second.root.scale.toArray());

    first.dispose();
    second.dispose();
  });

  it("changes fit deterministically for a different canonical avatar surface", () => {
    const descriptor = armorDescriptor();
    const profileA = createCanonicalAvatarProfile(profileInput("avatar-a"));
    const profileB = createCanonicalAvatarProfile(profileInput("avatar-b", 0.93));
    const geometryA = compileVisualItemGeometry(descriptor, 0);
    const geometryB = compileVisualItemGeometry(descriptor, 0);
    if (geometryA.kind !== "generated" || geometryB.kind !== "generated") throw new Error("expected generated geometry");

    const fitA = fitGeneratedEquipment(descriptor, geometryA, profileA, 2.0);
    const fitB = fitGeneratedEquipment(descriptor, geometryB, profileB, 1.86);

    expect(fitA.avatarProfileFingerprint).not.toBe(fitB.avatarProfileFingerprint);
    expect(fitA.avatarHeightMillimeters).not.toBe(fitB.avatarHeightMillimeters);
    expect(fitA.fitFingerprint).not.toBe(fitB.fitFingerprint);
    expect(fitA.descriptorHash).toBe(fitB.descriptorHash);
    expect(fitA.visualSeed).toBe(fitB.visualSeed);

    geometryA.dispose();
    geometryB.dispose();
  });

  it("fits all supported procedural armor slots without changing descriptor identity", () => {
    const profile = createCanonicalAvatarProfile(profileInput("avatar-a"));
    for (const [slot, expectedGlbSlot] of [["head", "helmet"], ["chest", "chest"], ["hands", "arms"], ["legs", "legs"], ["feet", "boots"]] as const) {
      const descriptor = armorDescriptor({ equipmentSlot: slot });
      const geometry = compileVisualItemGeometry(descriptor, 1);
      if (geometry.kind !== "generated") throw new Error("expected generated geometry");
      const beforeIdentity = descriptor.source.deterministicHash;
      const fit = fitGeneratedEquipment(descriptor, geometry, profile);
      const bounds = new THREE.Box3().setFromObject(geometry.root, true);
      expect(fit.equipmentSlot).toBe(expectedGlbSlot);
      expect(fit.descriptorHash).toBe(beforeIdentity);
      expect(fit.fitFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(bounds.isEmpty()).toBe(false);
      geometry.dispose();
    }
  });

  it("fails closed for unsupported profiles and non-armor descriptors", () => {
    const profile = createCanonicalAvatarProfile(profileInput("avatar-a"));
    const geometry = compileVisualItemGeometry(armorDescriptor(), 0);
    if (geometry.kind !== "generated") throw new Error("expected generated geometry");

    const unsupportedInput = profileInput("avatar-unsupported");
    const unsupported = createCanonicalAvatarProfile({
      ...unsupportedInput,
      attachmentSockets: unsupportedInput.attachmentSockets.filter(value => value.equipmentSlot === "helmet"),
      supportedEquipmentSlots: ["helmet"],
    });
    expect(() => fitGeneratedEquipment(armorDescriptor(), geometry, unsupported)).toThrow(/PROFILE_SLOT_UNSUPPORTED/);
    expect(() => fitGeneratedEquipment({ ...armorDescriptor(), category: "weapon", equipmentSlot: "main_hand" } as VisualItemDescriptor, geometry, profile)).toThrow(/CATEGORY_UNSUPPORTED/);
    geometry.dispose();
  });
});
