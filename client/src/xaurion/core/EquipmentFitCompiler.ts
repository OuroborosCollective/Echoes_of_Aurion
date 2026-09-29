import type {
  CanonicalAvatarBodyRegion,
  CanonicalAvatarBodyRegionId,
  CanonicalAvatarProfile,
} from "@shared/aurionCanonicalAvatarContract";
import { verifyCanonicalAvatarProfile } from "@shared/aurionCanonicalAvatarContract";
import { browserCanonicalSha256 as canonicalSha256 } from "@shared/aurionBrowserHash";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";
import type { GlbEquipmentSlot } from "@shared/glbImportContract";
import type { GeneratedVisualItemGeometry } from "./VisualItemGeometryCompiler";
import * as THREE from "three";

export const EQUIPMENT_FIT_PROTOCOL = "aurion.equipment-fit.v1" as const;
export const EQUIPMENT_FIT_VERSION = "aurion-equipment-fit.v1" as const;

type FitRegionSet = Readonly<{
  equipmentSlot: GlbEquipmentSlot;
  regionIds: readonly CanonicalAvatarBodyRegionId[];
}>;

export type EquipmentFitContract = Readonly<{
  protocol: typeof EQUIPMENT_FIT_PROTOCOL;
  version: typeof EQUIPMENT_FIT_VERSION;
  descriptorHash: string;
  visualSeed: string;
  morphologyRecipeHash: string;
  avatarProfileFingerprint: string;
  avatarProfileVersion: string;
  equipmentSlot: GlbEquipmentSlot;
  regionIds: readonly CanonicalAvatarBodyRegionId[];
  sourceBounds: Readonly<{
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }>;
  targetBounds: Readonly<{
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }>;
  scaleBasisPoints: number;
  translationMillimeters: readonly [number, number, number];
  clearanceBasisPoints: number;
  fitFingerprint: string;
}>;

const ARMOR_REGION_SETS: readonly FitRegionSet[] = Object.freeze([
  Object.freeze({ equipmentSlot: "helmet", regionIds: ["head"] }),
  Object.freeze({ equipmentSlot: "chest", regionIds: ["torso_front", "torso_back"] }),
  Object.freeze({
    equipmentSlot: "arms",
    regionIds: ["upper_arm_left", "upper_arm_right", "forearm_left", "forearm_right", "hand_left", "hand_right"],
  }),
  Object.freeze({
    equipmentSlot: "legs",
    regionIds: ["thigh_left", "thigh_right", "shin_left", "shin_right"],
  }),
  Object.freeze({ equipmentSlot: "boots", regionIds: ["foot_left", "foot_right"] }),
]);

const VISUAL_SLOT_TO_GLb = Object.freeze({
  head: "helmet",
  chest: "chest",
  hands: "arms",
  legs: "legs",
  feet: "boots",
} satisfies Readonly<Record<string, GlbEquipmentSlot>>);

const MIN_SCALE = 0.001;
const MAX_SCALE = 1000;
const SCALE_QUANTUM = 100_000;
const TRANSLATION_QUANTUM = 1_000;
const CLEARANCE_REDUCTION = 0.35;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function quantize(value: number, quantum: number): number {
  return Math.round(value * quantum);
}

function regionForSlot(slot: GlbEquipmentSlot): FitRegionSet {
  const result = ARMOR_REGION_SETS.find(value => value.equipmentSlot === slot);
  if (!result) throw new Error(`EQUIPMENT_FIT_SLOT_UNSUPPORTED:${slot}`);
  return result;
}

function aggregateRegionBounds(
  profile: CanonicalAvatarProfile,
  regionIds: readonly CanonicalAvatarBodyRegionId[],
): CanonicalAvatarBodyRegion["normalizedBounds"] {
  const wanted = new Set(regionIds);
  const regions = profile.bodyRegions
    .filter(region => wanted.has(region.regionId))
    .sort((left, right) => compareText(left.regionId, right.regionId));
  if (regions.length !== regionIds.length) throw new Error("EQUIPMENT_FIT_REGION_MISSING");

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const region of regions) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, region.normalizedBounds.min[axis]!);
      max[axis] = Math.max(max[axis]!, region.normalizedBounds.max[axis]!);
    }
  }
  if (![...min, ...max].every(Number.isFinite)) throw new Error("EQUIPMENT_FIT_TARGET_BOUNDS_INVALID");
  return Object.freeze({ min, max });
}

function aggregateClearance(
  profile: CanonicalAvatarProfile,
  regionIds: readonly CanonicalAvatarBodyRegionId[],
): number {
  const wanted = new Set(regionIds);
  const values = profile.armorClearanceEnvelopes
    .filter(value => wanted.has(value.regionId))
    .map(value => value.radiusNormalized)
    .filter(Number.isFinite);
  if (!values.length) throw new Error("EQUIPMENT_FIT_CLEARANCE_MISSING");
  return Math.max(...values);
}

function assertFiniteBounds(bounds: THREE.Box3, code: string): void {
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
    throw new Error(code);
  }
}

function descriptorBinding(descriptor: VisualItemDescriptor): string {
  return descriptor.source.deterministicHash + ":" + descriptor.source.contextHash + ":" + descriptor.visualSeed;
}

function buildFitFingerprint(
  input: Readonly<{
    descriptor: VisualItemDescriptor;
    profile: CanonicalAvatarProfile;
    contract: Omit<EquipmentFitContract, "fitFingerprint">;
  }>,
): string {
  return canonicalSha256({
    domain: "aurion.equipment-fit.v1",
    descriptorBinding: descriptorBinding(input.descriptor),
    avatarProfileFingerprint: input.profile.profileFingerprint,
    contract: input.contract,
  });
}

/**
 * Fits generated armor against the canonical avatar surface envelopes.
 *
 * Identity inputs are reduced to bounded integers before fingerprinting.
 * Renderer transforms are derived from those integers plus the generated mesh
 * bounds. No gameplay/state/persistence values are mutated.
 */
function fitEquipmentGroupInternal(
  descriptor: VisualItemDescriptor,
  root: THREE.Group,
  morphologyRecipeHash: string,
  profile: CanonicalAvatarProfile,
): EquipmentFitContract {
  if (descriptor.category !== "armor") throw new Error("EQUIPMENT_FIT_CATEGORY_UNSUPPORTED");
  if (!verifyCanonicalAvatarProfile(profile)) throw new Error("EQUIPMENT_FIT_AVATAR_PROFILE_INVALID");

  const glbSlot = VISUAL_SLOT_TO_GLb[descriptor.equipmentSlot ?? ""];
  if (!glbSlot) throw new Error("EQUIPMENT_FIT_VISUAL_SLOT_UNSUPPORTED");
  if (!profile.supportedEquipmentSlots.includes(glbSlot)) {
    throw new Error("EQUIPMENT_FIT_PROFILE_SLOT_UNSUPPORTED");
  }

  const regionSet = regionForSlot(glbSlot);
  const targetBounds = aggregateRegionBounds(profile, regionSet.regionIds);
  const clearance = aggregateClearance(profile, regionSet.regionIds);

  root.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(root, true);
  assertFiniteBounds(sourceBounds, "EQUIPMENT_FIT_SOURCE_BOUNDS_INVALID");

  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const targetSize = new THREE.Vector3(
    targetBounds.max[0] - targetBounds.min[0],
    targetBounds.max[1] - targetBounds.min[1],
    targetBounds.max[2] - targetBounds.min[2],
  );
  const usableSize = targetSize.clone().subScalar(clearance * CLEARANCE_REDUCTION * 2);
  usableSize.set(
    Math.max(0.0001, usableSize.x),
    Math.max(0.0001, usableSize.y),
    Math.max(0.0001, usableSize.z),
  );

  const sourceMax = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);
  const targetMax = Math.max(usableSize.x, usableSize.y, usableSize.z);
  if (!Number.isFinite(sourceMax) || sourceMax <= 0.000001 || !Number.isFinite(targetMax) || targetMax <= 0) {
    throw new Error("EQUIPMENT_FIT_DIMENSIONS_INVALID");
  }

  const scale = clamp(targetMax / sourceMax, MIN_SCALE, MAX_SCALE);
  const scaleBasisPoints = quantize(scale, SCALE_QUANTUM);
  const quantizedScale = scaleBasisPoints / SCALE_QUANTUM;

  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const targetCenter = new THREE.Vector3(
    (targetBounds.min[0] + targetBounds.max[0]) / 2,
    (targetBounds.min[1] + targetBounds.max[1]) / 2,
    (targetBounds.min[2] + targetBounds.max[2]) / 2,
  );
  const translation = targetCenter.clone().sub(sourceCenter.multiplyScalar(quantizedScale));
  const translationMillimeters: [number, number, number] = [
    quantize(translation.x, TRANSLATION_QUANTUM),
    quantize(translation.y, TRANSLATION_QUANTUM),
    quantize(translation.z, TRANSLATION_QUANTUM),
  ];

  root.scale.setScalar(quantizedScale);
  root.position.set(
    translationMillimeters[0] / TRANSLATION_QUANTUM,
    translationMillimeters[1] / TRANSLATION_QUANTUM,
    translationMillimeters[2] / TRANSLATION_QUANTUM,
  );
  root.updateMatrixWorld(true);

  const contractWithoutFingerprint: Omit<EquipmentFitContract, "fitFingerprint"> = Object.freeze({
    protocol: EQUIPMENT_FIT_PROTOCOL,
    version: EQUIPMENT_FIT_VERSION,
    descriptorHash: descriptor.source.deterministicHash,
    visualSeed: descriptor.visualSeed,
    morphologyRecipeHash: morphologyRecipeHash,
    avatarProfileFingerprint: profile.profileFingerprint,
    avatarProfileVersion: profile.avatarProfileVersion,
    equipmentSlot: glbSlot,
    regionIds: Object.freeze([...regionSet.regionIds]),
    sourceBounds: Object.freeze({
      min: Object.freeze(sourceBounds.min.toArray() as [number, number, number]),
      max: Object.freeze(sourceBounds.max.toArray() as [number, number, number]),
    }),
    targetBounds: Object.freeze({
      min: Object.freeze(targetBounds.min),
      max: Object.freeze(targetBounds.max),
    }),
    scaleBasisPoints,
    translationMillimeters: Object.freeze(translationMillimeters),
    clearanceBasisPoints: quantize(clearance, 10_000),
  });

  return Object.freeze({
    ...contractWithoutFingerprint,
    fitFingerprint: buildFitFingerprint({
      descriptor,
      profile,
      contract: contractWithoutFingerprint,
    }),
  });
}


export function fitGeneratedEquipment(
  descriptor: VisualItemDescriptor,
  geometry: GeneratedVisualItemGeometry,
  profile: CanonicalAvatarProfile,
): EquipmentFitContract {
  if (geometry.kind !== "generated") throw new Error("EQUIPMENT_FIT_GEOMETRY_UNSUPPORTED");
  return fitEquipmentGroupInternal(descriptor, geometry.root, geometry.morphologyRecipeHash, profile);
}

export function fitEquipmentGroup(
  descriptor: VisualItemDescriptor,
  root: THREE.Group,
  morphologyRecipeHash: string,
  profile: CanonicalAvatarProfile,
): EquipmentFitContract {
  return fitEquipmentGroupInternal(descriptor, root, morphologyRecipeHash, profile);
}
