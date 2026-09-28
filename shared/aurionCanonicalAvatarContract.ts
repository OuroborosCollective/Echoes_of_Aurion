import { browserCanonicalSha256 as canonicalSha256 } from "./aurionBrowserHash";
import type { GlbEquipmentSlot } from "./glbImportContract";

export const AURION_CANONICAL_AVATAR_PROTOCOL =
  "aurion-canonical-avatar.v1" as const;
export const canonicalAvatarDeformationModes = [
  "rigid",
  "skinned",
  "skinned_with_morphs",
] as const;
export type CanonicalAvatarDeformationMode =
  (typeof canonicalAvatarDeformationModes)[number];

export const canonicalAvatarBodyRegionIds = [
  "head",
  "neck",
  "torso_front",
  "torso_back",
  "shoulder_left",
  "shoulder_right",
  "upper_arm_left",
  "upper_arm_right",
  "forearm_left",
  "forearm_right",
  "hand_left",
  "hand_right",
  "thigh_left",
  "thigh_right",
  "shin_left",
  "shin_right",
  "foot_left",
  "foot_right",
] as const;
export type CanonicalAvatarBodyRegionId =
  (typeof canonicalAvatarBodyRegionIds)[number];

export type CanonicalAvatarVec3 = readonly [number, number, number];
export type CanonicalAvatarQuat = readonly [number, number, number, number];

export type CanonicalAvatarBone = Readonly<{
  boneId: string;
  sourceName: string;
  parentBoneId: string | null;
  restPositionNormalized: CanonicalAvatarVec3;
  restQuaternion: CanonicalAvatarQuat;
}>;

export type CanonicalAvatarBodyRegion = Readonly<{
  regionId: CanonicalAvatarBodyRegionId;
  boneId: string;
  normalizedBounds: Readonly<{
    min: CanonicalAvatarVec3;
    max: CanonicalAvatarVec3;
  }>;
  clearanceRadiusNormalized: number;
}>;

export type CanonicalAvatarSocket = Readonly<{
  equipmentSlot: GlbEquipmentSlot;
  socketId: string;
  boneId: string;
  positionNormalized: CanonicalAvatarVec3;
}>;

export type CanonicalAvatarSurfaceLandmark = Readonly<{
  landmarkId: string;
  boneId: string;
  positionNormalized: CanonicalAvatarVec3;
}>;

export type CanonicalAvatarProfile = Readonly<{
  protocol: typeof AURION_CANONICAL_AVATAR_PROTOCOL;
  avatarProfileId: string;
  avatarProfileVersion: string;
  skeletonRevision: string;
  bones: readonly CanonicalAvatarBone[];
  bodyRegions: readonly CanonicalAvatarBodyRegion[];
  attachmentSockets: readonly CanonicalAvatarSocket[];
  normalizedBounds: Readonly<{
    min: CanonicalAvatarVec3;
    max: CanonicalAvatarVec3;
  }>;
  armorClearanceEnvelopes: readonly Readonly<{
    regionId: CanonicalAvatarBodyRegionId;
    radiusNormalized: number;
  }>[];
  supportedEquipmentSlots: readonly GlbEquipmentSlot[];
  surfaceLandmarks: readonly CanonicalAvatarSurfaceLandmark[];
  deformationMode: CanonicalAvatarDeformationMode;
  profileFingerprint: string;
}>;

export type CanonicalAvatarProfileInput = Omit<
  CanonicalAvatarProfile,
  "protocol" | "profileFingerprint"
>;

const isFiniteVector = (value: readonly number[], length: number): boolean =>
  value.length === length && value.every(Number.isFinite);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const sortedUnique = (values: readonly string[]): boolean =>
  values.every((value, index) => index === 0 || values[index - 1]! < value);
const validBounds = (bounds: {
  min: CanonicalAvatarVec3;
  max: CanonicalAvatarVec3;
}): boolean =>
  isFiniteVector(bounds.min, 3) &&
  isFiniteVector(bounds.max, 3) &&
  bounds.min.every((value, index) => value < bounds.max[index]!);

function fail(reason: string): never {
  throw new Error(`CANONICAL_AVATAR_${reason}`);
}

function unsignedProfile(
  input: CanonicalAvatarProfileInput
): Omit<CanonicalAvatarProfile, "profileFingerprint"> {
  return Object.freeze({
    protocol: AURION_CANONICAL_AVATAR_PROTOCOL,
    ...input,
  });
}

export function validateCanonicalAvatarProfile(
  input: CanonicalAvatarProfileInput
): void {
  if (
    !nonEmpty(input.avatarProfileId) ||
    !nonEmpty(input.avatarProfileVersion) ||
    !nonEmpty(input.skeletonRevision)
  )
    fail("IDENTITY_INVALID");
  if (!validBounds(input.normalizedBounds)) fail("BOUNDS_INVALID");
  if (!canonicalAvatarDeformationModes.includes(input.deformationMode))
    fail("DEFORMATION_MODE_INVALID");
  if (!sortedUnique(input.supportedEquipmentSlots)) fail("SLOTS_NOT_CANONICAL");
  if (!sortedUnique(input.bones.map(value => value.boneId)))
    fail("BONES_NOT_CANONICAL");
  if (input.bones.length < 6) fail("BONES_INCOMPLETE");
  const boneIds = new Set(input.bones.map(value => value.boneId));
  for (const bone of input.bones) {
    if (
      !nonEmpty(bone.boneId) ||
      !nonEmpty(bone.sourceName) ||
      (bone.parentBoneId !== null && !boneIds.has(bone.parentBoneId))
    )
      fail("BONE_REFERENCE_INVALID");
    if (
      !isFiniteVector(bone.restPositionNormalized, 3) ||
      !isFiniteVector(bone.restQuaternion, 4)
    )
      fail("BONE_TRANSFORM_INVALID");
  }
  const regions = input.bodyRegions.map(value => value.regionId);
  if (!sortedUnique(regions) || regions.length === 0)
    fail("REGIONS_NOT_CANONICAL");
  for (const region of input.bodyRegions) {
    if (
      !boneIds.has(region.boneId) ||
      !validBounds(region.normalizedBounds) ||
      !Number.isFinite(region.clearanceRadiusNormalized) ||
      region.clearanceRadiusNormalized < 0
    )
      fail("REGION_INVALID");
  }
  const sockets = input.attachmentSockets.map(value => value.equipmentSlot);
  if (!sortedUnique(sockets)) fail("SOCKETS_NOT_CANONICAL");
  for (const socket of input.attachmentSockets) {
    if (
      !nonEmpty(socket.socketId) ||
      !boneIds.has(socket.boneId) ||
      !isFiniteVector(socket.positionNormalized, 3) ||
      !input.supportedEquipmentSlots.includes(socket.equipmentSlot)
    )
      fail("SOCKET_INVALID");
  }
  for (const envelope of input.armorClearanceEnvelopes) {
    if (
      !regions.includes(envelope.regionId) ||
      !Number.isFinite(envelope.radiusNormalized) ||
      envelope.radiusNormalized < 0
    )
      fail("CLEARANCE_INVALID");
  }
  for (const landmark of input.surfaceLandmarks) {
    if (
      !nonEmpty(landmark.landmarkId) ||
      !boneIds.has(landmark.boneId) ||
      !isFiniteVector(landmark.positionNormalized, 3)
    )
      fail("LANDMARK_INVALID");
  }
}

export function createCanonicalAvatarProfile(
  input: CanonicalAvatarProfileInput
): CanonicalAvatarProfile {
  validateCanonicalAvatarProfile(input);
  const unsigned = unsignedProfile(input);
  return Object.freeze({
    ...unsigned,
    profileFingerprint: canonicalSha256({
      domain: "aurion.canonical-avatar-profile.v1",
      profile: unsigned,
    }),
  });
}

export function verifyCanonicalAvatarProfile(
  profile: CanonicalAvatarProfile
): boolean {
  try {
    const { protocol, profileFingerprint, ...input } = profile;
    validateCanonicalAvatarProfile(input);
    return (
      protocol === AURION_CANONICAL_AVATAR_PROTOCOL &&
      profileFingerprint ===
        createCanonicalAvatarProfile(input).profileFingerprint
    );
  } catch {
    return false;
  }
}
