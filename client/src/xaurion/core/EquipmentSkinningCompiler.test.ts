import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createCanonicalAvatarProfile,
  type CanonicalAvatarProfile,
} from "@shared/aurionCanonicalAvatarContract";
import { visualItemDescriptorSchema } from "@shared/visualItemProtocol";
import { compileEquipmentSkinning } from "./EquipmentSkinningCompiler";

const hash = (char: string) => char.repeat(64);

const bones = [
  { boneId: "chest", sourceName: "Chest", parentBoneId: "spine", restPositionNormalized: [0, 0.65, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
  { boneId: "hand_left", sourceName: "Hand_L", parentBoneId: "chest", restPositionNormalized: [-0.22, 0.62, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
  { boneId: "head", sourceName: "Head", parentBoneId: "chest", restPositionNormalized: [0, 0.85, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
  { boneId: "pelvis", sourceName: "Hips", parentBoneId: "root", restPositionNormalized: [0, 0.45, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
  { boneId: "root", sourceName: "Root", parentBoneId: null, restPositionNormalized: [0, 0, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
  { boneId: "spine", sourceName: "Spine", parentBoneId: "pelvis", restPositionNormalized: [0, 0.58, 0] as const, restQuaternion: [0, 0, 0, 1] as const },
].sort((a, b) => a.boneId.localeCompare(b.boneId));

function profile(): CanonicalAvatarProfile {
  return createCanonicalAvatarProfile({
    avatarProfileId: "avatar-test",
    avatarProfileVersion: "aurion-avatar-profile.v1",
    skeletonRevision: hash("a"),
    bones,
    bodyRegions: [
      {
        regionId: "chest",
        boneId: "chest",
        normalizedBounds: { min: [-0.3, 0.5, -0.2], max: [0.3, 0.8, 0.2] },
        clearanceRadiusNormalized: 0.3,
      },
      {
        regionId: "head",
        boneId: "head",
        normalizedBounds: { min: [-0.2, 0.75, -0.2], max: [0.2, 1, 0.2] },
        clearanceRadiusNormalized: 0.2,
      },
    ].sort((a, b) => a.regionId.localeCompare(b.regionId)),
    attachmentSockets: [{
      equipmentSlot: "weapon",
      socketId: "aurion:weapon",
      boneId: "hand_left",
      positionNormalized: [-0.22, 0.62, 0],
    }],
    normalizedBounds: {
      min: [-0.5, 0, -0.5],
      max: [0.5, 1, 0.5],
    },
    armorClearanceEnvelopes: [
      { regionId: "chest", radiusNormalized: 0.3 },
      { regionId: "head", radiusNormalized: 0.2 },
    ].sort((a, b) => a.regionId.localeCompare(b.regionId)),
    supportedEquipmentSlots: ["weapon"],
    surfaceLandmarks: [{
      landmarkId: "head",
      boneId: "head",
      positionNormalized: [0, 0.85, 0],
    }],
    deformationMode: "skinned",
  });
}

function descriptor() {
  return visualItemDescriptorSchema.parse({
    version: "aurion-item-visual.v1",
    itemDefinitionId: "armor-chest-test",
    familyId: "heavy",
    category: "armor",
    equipmentSlot: "chest",
    quality: "rare",
    affixes: [],
    setId: null,
    visual: null,
    source: {
      lootReceiptId: "receipt-520",
      contextHash: hash("b"),
      deterministicHash: hash("c"),
      visualEventIndex: 0,
    },
    visualSeed: hash("d"),
  });
}

function rig() {
  const avatarRoot = new THREE.Group();
  const byId = new Map<string, THREE.Bone>();
  for (const bone of bones) {
    const node = new THREE.Bone();
    node.name = bone.sourceName;
    byId.set(bone.boneId, node);
  }
  for (const bone of bones) {
    const node = byId.get(bone.boneId)!;
    if (bone.parentBoneId) byId.get(bone.parentBoneId)!.add(node);
    else avatarRoot.add(node);
    node.position.set(
      bone.restPositionNormalized[0] * 2 - (bone.parentBoneId ? (byId.get(bone.parentBoneId)?.position.x ?? 0) : 0),
      bone.parentBoneId
        ? (bone.restPositionNormalized[1] - (byId.get(bone.parentBoneId)?.userData.normY ?? 0)) * 2
        : bone.restPositionNormalized[1] * 2,
      bone.restPositionNormalized[2] * 2,
    );
    node.userData.normY = bone.restPositionNormalized[1];
  }
  avatarRoot.updateMatrixWorld(true);

  const host = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(1, 2, 1),
    new THREE.MeshBasicMaterial(),
  );
  const skeleton = new THREE.Skeleton([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
  skeleton.calculateInverses();
  host.bind(skeleton, new THREE.Matrix4());
  avatarRoot.add(host);
  avatarRoot.updateMatrixWorld(true);

  const visualRoot = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.3), new THREE.MeshBasicMaterial());
  shell.name = "cuirass";
  shell.position.set(0, 1.25, 0);
  visualRoot.add(shell);
  avatarRoot.add(visualRoot);
  avatarRoot.updateMatrixWorld(true);
  return { avatarRoot, visualRoot };
}

function firstSkinWeights(root: THREE.Group) {
  const mesh = root.children.find(value => (value as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
  const indices = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  return {
    indices: Array.from(indices.array as ArrayLike<number>),
    weights: Array.from(weights.array as ArrayLike<number>).map(value => Number(value.toFixed(8))),
    mesh,
  };
}

describe("EquipmentSkinningCompiler", () => {
  it("is deterministic for identical descriptor, fitted geometry and canonical avatar profile", () => {
    const first = rig();
    const second = rig();
    const firstResult = compileEquipmentSkinning(descriptor(), first.visualRoot, "morph-a", first.avatarRoot, profile(), 2);
    const secondResult = compileEquipmentSkinning(descriptor(), second.visualRoot, "morph-a", second.avatarRoot, profile(), 2);
    if (!firstResult || !secondResult) {
      throw new Error(
        `SKINNING_NULL:${first.visualRoot.userData.aurionEquipmentSkinningFailure ?? "-"}:${second.visualRoot.userData.aurionEquipmentSkinningFailure ?? "-"}`,
      );
    }
    expect(firstResult?.skinningFingerprint).toBe(secondResult?.skinningFingerprint);
    expect(firstResult?.weightFingerprint).toBe(secondResult?.weightFingerprint);
    expect(firstSkinWeights(first.visualRoot).indices).toEqual(firstSkinWeights(second.visualRoot).indices);
    expect(firstSkinWeights(first.visualRoot).weights).toEqual(firstSkinWeights(second.visualRoot).weights);
  });

  it("replaces static armor meshes with shared-skeleton SkinnedMesh projections", () => {
    const value = rig();
    const result = compileEquipmentSkinning(descriptor(), value.visualRoot, "morph-a", value.avatarRoot, profile(), 2);
    if (!result) {
      throw new Error(
        `SKINNING_NULL:${value.visualRoot.userData.aurionEquipmentSkinningFailure ?? "-"}`,
      );
    }
    expect(result.policy).toBe("surface-skin");
    expect(result?.maxInfluences).toBe(4);
    expect(result?.vertexCount).toBeGreaterThan(0);
    expect(value.visualRoot.children).toHaveLength(1);
    expect((value.visualRoot.children[0] as THREE.SkinnedMesh).isSkinnedMesh).toBe(true);
    expect(value.visualRoot.userData.aurionEquipmentSkinning.skinningFingerprint).toBe(result?.skinningFingerprint);
  });

  it("fails closed when the avatar is not skinned", () => {
    const value = rig();
    const staticProfile = createCanonicalAvatarProfile({
      ...profile(),
      deformationMode: "rigid",
    });
    const result = compileEquipmentSkinning(descriptor(), value.visualRoot, "morph-a", value.avatarRoot, staticProfile, 2);
    expect(result).toBeNull();
  });

  it("keeps zero-sum padding deterministic and every vertex fully weighted", () => {
    const value = rig();
    const result = compileEquipmentSkinning(descriptor(), value.visualRoot, "morph-a", value.avatarRoot, profile(), 2);
    if (!result) {
      throw new Error(
        `SKINNING_NULL:${value.visualRoot.userData.aurionEquipmentSkinningFailure ?? "-"}`,
      );
    }
    const { weights } = firstSkinWeights(value.visualRoot);
    for (let index = 0; index < weights.length; index += 4)
      expect(Number(weights.slice(index, index + 4).reduce((sum, current) => sum + current, 0).toFixed(6))).toBe(1);
  });
});
