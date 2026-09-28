import * as THREE from "three";
import type { GlbEquipmentSlot } from "@shared/glbImportContract";
import {
  canonicalAvatarBodyRegionIds,
  createCanonicalAvatarProfile,
  type CanonicalAvatarBodyRegion,
  type CanonicalAvatarBone,
  type CanonicalAvatarProfile,
  type CanonicalAvatarSurfaceLandmark,
  type CanonicalAvatarSocket,
} from "@shared/aurionCanonicalAvatarContract";
import { browserCanonicalSha256 as canonicalSha256 } from "@shared/aurionBrowserHash";
import { equipmentAnchorAliases } from "./EquipmentAttachmentSizing";

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const finite = (values: readonly number[]): boolean =>
  values.every(Number.isFinite);
const slots = Object.keys(equipmentAnchorAliases).sort() as GlbEquipmentSlot[];

const boneAliases = Object.freeze({
  root: ["root", "armatureroot", "mixamorigroot", "ccbasehip"],
  pelvis: ["pelvis", "hips", "mixamorighips", "ccbasehip", "jbiphips"],
  spine: ["spine", "mixamorიგspine", "mixamorigspine", "ccbasespine01"],
  chest: [
    "chest",
    "upperchest",
    "spine2",
    "mixamorigs spine2",
    "mixamorigspine2",
    "ccbasespine02",
  ],
  neck: ["neck", "mixamorigneck", "ccbaseneck", "jbipneck"],
  head: ["head", "mixamorighead", "ccbasehead", "jbiphead"],
  upper_arm_left: [
    "upperarml",
    "leftupperarm",
    "mixamorigleftarm",
    "ccbaselupperarm",
  ],
  upper_arm_right: [
    "upperarmr",
    "rightupperarm",
    "mixamor ightarm",
    "mixamorigrightarm",
    "ccbaserupperarm",
  ],
  forearm_left: [
    "forearml",
    "leftforearm",
    "lowerarml",
    "mixamorigleftforearm",
    "ccbaselforearm",
  ],
  forearm_right: [
    "forearmr",
    "rightforearm",
    "lowerarmr",
    "mixamorig rightforearm",
    "mixamorigrightforearm",
    "ccbaserforearm",
  ],
  hand_left: [
    "handl",
    "lefthand",
    "mixamoriglefthand",
    "ccbaselhand",
    "jbiplhand",
  ],
  hand_right: [
    "handr",
    "righthand",
    "mixamorigrighthand",
    "ccbaserhand",
    "jbiprhand",
  ],
  thigh_left: [
    "thighl",
    "leftupleg",
    "upperlegl",
    "mixamorigleftupleg",
    "ccbaselthigh",
  ],
  thigh_right: [
    "thighr",
    "rightupleg",
    "upperlegr",
    "mixamorigrightupleg",
    "ccbaserthigh",
  ],
  shin_left: [
    "shinl",
    "leftleg",
    "lowerlegl",
    "mixamorigleftleg",
    "ccbaselcalf",
  ],
  shin_right: [
    "shinr",
    "rightleg",
    "lowerlegr",
    "mixamorigrightleg",
    "ccbasercalf",
  ],
  foot_left: [
    "footl",
    "leftfoot",
    "mixamorigleftfoot",
    "ccbaselfoot",
    "jbiplfoot",
  ],
  foot_right: [
    "footr",
    "rightfoot",
    "mixamorightrightfoot",
    "mixamorigrightfoot",
    "ccbaserfoot",
    "jbiprfoot",
  ],
} satisfies Record<string, readonly string[]>);

type BoneId = keyof typeof boneAliases;
type ProfileOptions = Readonly<{
  avatarProfileId: string;
  avatarProfileVersion?: string;
}>;

function findNamedBones(model: THREE.Object3D): Map<string, THREE.Bone> {
  const byName = new Map<string, THREE.Bone>();
  model.traverse(node => {
    if (!(node as THREE.Bone).isBone || !node.name) return;
    const key = normalize(node.name);
    if (!byName.has(key)) byName.set(key, node as THREE.Bone);
  });
  return byName;
}

function resolveBones(model: THREE.Object3D): Map<BoneId, THREE.Bone> {
  const byName = findNamedBones(model);
  const result = new Map<BoneId, THREE.Bone>();
  for (const [boneId, aliases] of Object.entries(boneAliases) as [
    BoneId,
    readonly string[],
  ][]) {
    const bone = aliases
      .map(normalize)
      .map(alias => byName.get(alias))
      .find(Boolean);
    if (!bone) throw new Error(`CANONICAL_AVATAR_BONE_MISSING:${boneId}`);
    result.set(boneId, bone);
  }
  return result;
}

function normalizedPosition(
  model: THREE.Object3D,
  point: THREE.Vector3,
  bounds: THREE.Box3,
  height: number
): readonly [number, number, number] {
  const local = model.worldToLocal(point.clone());
  const result: [number, number, number] = [
    (local.x - (bounds.min.x + bounds.max.x) / 2) / height,
    (local.y - bounds.min.y) / height,
    (local.z - (bounds.min.z + bounds.max.z) / 2) / height,
  ];
  if (!finite(result)) throw new Error("CANONICAL_AVATAR_POSITION_NON_FINITE");
  return result;
}

function nearestCanonicalBone(
  node: THREE.Object3D,
  bones: Map<BoneId, THREE.Bone>
): BoneId | null {
  let current: THREE.Object3D | null = node;
  while (current) {
    for (const [boneId, bone] of bones) if (bone === current) return boneId;
    current = current.parent;
  }
  return null;
}

function findNodeByAliases(
  model: THREE.Object3D,
  aliases: readonly string[]
): THREE.Object3D | null {
  const normalizedAliases = aliases.map(normalize);
  let found: THREE.Object3D | null = null;
  model.traverse(node => {
    if (!found && node.name && normalizedAliases.includes(normalize(node.name)))
      found = node;
  });
  return found;
}

function regionEnvelope(
  regionId: (typeof canonicalAvatarBodyRegionIds)[number],
  boneId: BoneId,
  position: readonly [number, number, number]
): CanonicalAvatarBodyRegion {
  const radii: Record<string, readonly [number, number, number]> = {
    head: [0.1, 0.12, 0.1],
    neck: [0.08, 0.08, 0.08],
    torso_front: [0.24, 0.28, 0.16],
    torso_back: [0.24, 0.28, 0.16],
    shoulder_left: [0.12, 0.1, 0.12],
    shoulder_right: [0.12, 0.1, 0.12],
    upper_arm_left: [0.08, 0.18, 0.08],
    upper_arm_right: [0.08, 0.18, 0.08],
    forearm_left: [0.07, 0.16, 0.07],
    forearm_right: [0.07, 0.16, 0.07],
    hand_left: [0.07, 0.07, 0.07],
    hand_right: [0.07, 0.07, 0.07],
    thigh_left: [0.11, 0.24, 0.11],
    thigh_right: [0.11, 0.24, 0.11],
    shin_left: [0.09, 0.22, 0.09],
    shin_right: [0.09, 0.22, 0.09],
    foot_left: [0.1, 0.07, 0.18],
    foot_right: [0.1, 0.07, 0.18],
  };
  const radius = radii[regionId];
  const min: [number, number, number] = [
    position[0] - radius[0],
    position[1] - radius[1],
    position[2] - radius[2],
  ];
  const max: [number, number, number] = [
    position[0] + radius[0],
    position[1] + radius[1],
    position[2] + radius[2],
  ];
  return Object.freeze({
    regionId,
    boneId,
    normalizedBounds: { min, max },
    clearanceRadiusNormalized: Math.max(...radius),
  });
}

export function extractCanonicalAvatarProfile(
  model: THREE.Object3D,
  options: ProfileOptions
): CanonicalAvatarProfile {
  if (!options.avatarProfileId.trim())
    throw new Error("CANONICAL_AVATAR_PROFILE_ID_REQUIRED");
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model, true);
  const size = bounds.getSize(new THREE.Vector3());
  const height = size.y;
  if (bounds.isEmpty() || !Number.isFinite(height) || height <= 0.0001)
    throw new Error("CANONICAL_AVATAR_BOUNDS_INVALID");
  const resolved = resolveBones(model);
  const positions = new Map<BoneId, readonly [number, number, number]>();
  for (const [boneId, bone] of resolved)
    positions.set(
      boneId,
      normalizedPosition(
        model,
        bone.getWorldPosition(new THREE.Vector3()),
        bounds,
        height
      )
    );
  const bones: CanonicalAvatarBone[] = [...resolved.entries()]
    .map(([boneId, bone]) => {
      const parent =
        [...resolved.entries()].find(
          ([, candidate]) => candidate === bone.parent
        )?.[0] ?? null;
      return {
        boneId,
        sourceName: bone.name,
        parentBoneId: parent,
        restPositionNormalized: positions.get(boneId)!,
        restQuaternion: bone.quaternion.toArray() as [
          number,
          number,
          number,
          number,
        ],
      };
    })
    .sort((left, right) => left.boneId.localeCompare(right.boneId));
  const regionBoneMap: Readonly<
    Record<(typeof canonicalAvatarBodyRegionIds)[number], BoneId>
  > = {
    head: "head",
    neck: "neck",
    torso_front: "chest",
    torso_back: "spine",
    shoulder_left: "upper_arm_left",
    shoulder_right: "upper_arm_right",
    upper_arm_left: "upper_arm_left",
    upper_arm_right: "upper_arm_right",
    forearm_left: "forearm_left",
    forearm_right: "forearm_right",
    hand_left: "hand_left",
    hand_right: "hand_right",
    thigh_left: "thigh_left",
    thigh_right: "thigh_right",
    shin_left: "shin_left",
    shin_right: "shin_right",
    foot_left: "foot_left",
    foot_right: "foot_right",
  };
  const bodyRegions = canonicalAvatarBodyRegionIds
    .map(regionId =>
      regionEnvelope(
        regionId,
        regionBoneMap[regionId],
        positions.get(regionBoneMap[regionId])!
      )
    )
    .sort((left, right) => left.regionId.localeCompare(right.regionId));
  const attachmentSockets: CanonicalAvatarSocket[] = [];
  for (const equipmentSlot of slots) {
    const socketNode = findNodeByAliases(
      model,
      equipmentAnchorAliases[equipmentSlot]
    );
    if (!socketNode) continue;
    const boneId = nearestCanonicalBone(socketNode, resolved);
    if (!boneId) continue;
    attachmentSockets.push({
      equipmentSlot,
      socketId: `aurion:${equipmentSlot}`,
      boneId,
      positionNormalized: normalizedPosition(
        model,
        socketNode.getWorldPosition(new THREE.Vector3()),
        bounds,
        height
      ),
    });
  }
  if (attachmentSockets.length === 0)
    throw new Error("CANONICAL_AVATAR_SOCKET_MISSING");
  const supportedEquipmentSlots = [
    ...new Set(attachmentSockets.map(value => value.equipmentSlot)),
  ].sort() as GlbEquipmentSlot[];
  const landmarks: CanonicalAvatarSurfaceLandmark[] = [
    "head",
    "hand_left",
    "hand_right",
    "foot_left",
    "foot_right",
  ]
    .map(landmarkId => ({
      landmarkId,
      boneId: landmarkId as BoneId,
      positionNormalized: positions.get(landmarkId as BoneId)!,
    }))
    .sort((left, right) => left.landmarkId.localeCompare(right.landmarkId));
  const normalizedBounds = {
    min: normalizedPosition(model, bounds.min, bounds, height),
    max: normalizedPosition(model, bounds.max, bounds, height),
  };
  const deformationMode = (() => {
    let skinned = false;
    let morphs = false;
    model.traverse(node => {
      const mesh = node as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        skinned = true;
        morphs ||= Object.keys(mesh.geometry.morphAttributes).length > 0;
      }
    });
    return skinned ? (morphs ? "skinned_with_morphs" : "skinned") : "rigid";
  })();
  const skeletonRevision = canonicalSha256({
    domain: "aurion.canonical-avatar-skeleton.v1",
    bones: bones.map(({ boneId, sourceName, parentBoneId }) => ({
      boneId,
      sourceName,
      parentBoneId,
    })),
  });
  return createCanonicalAvatarProfile({
    avatarProfileId: options.avatarProfileId,
    avatarProfileVersion:
      options.avatarProfileVersion ?? "aurion-avatar-profile.v1",
    skeletonRevision,
    bones,
    bodyRegions,
    attachmentSockets: attachmentSockets.sort((left, right) =>
      left.equipmentSlot.localeCompare(right.equipmentSlot)
    ),
    normalizedBounds: { min: normalizedBounds.min, max: normalizedBounds.max },
    armorClearanceEnvelopes: bodyRegions
      .map(region => ({
        regionId: region.regionId,
        radiusNormalized: region.clearanceRadiusNormalized,
      }))
      .sort((left, right) => left.regionId.localeCompare(right.regionId)),
    supportedEquipmentSlots,
    surfaceLandmarks: landmarks,
    deformationMode,
  });
}
