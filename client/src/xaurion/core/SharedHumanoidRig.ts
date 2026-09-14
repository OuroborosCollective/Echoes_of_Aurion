import * as THREE from "three";
import {
  SHARED_HUMANOID_RIG_JOINTS,
  SHARED_HUMANOID_RIG_VERSION,
  matchesSharedHumanoidRigJointNames,
} from "@shared/sharedHumanoidRigContract";

export type SharedRigRebindEvidence = Readonly<{
  rigContract: typeof SHARED_HUMANOID_RIG_VERSION;
  skinnedMeshes: number;
  joints: number;
}>;

const INVERSE_BIND_EPSILON = 1e-5;

function skeletonMatches(skeleton: THREE.Skeleton): boolean {
  return matchesSharedHumanoidRigJointNames(skeleton.bones.map(bone => bone.name))
    && skeleton.boneInverses.length === SHARED_HUMANOID_RIG_JOINTS.length;
}

function matrixMatches(left: THREE.Matrix4, right: THREE.Matrix4): boolean {
  return left.elements.every((value, index) => Math.abs(value - right.elements[index]!) <= INVERSE_BIND_EPSILON);
}

function inverseBindPoseMatches(left: THREE.Skeleton, right: THREE.Skeleton): boolean {
  if (!skeletonMatches(left) || !skeletonMatches(right)) return false;
  return left.boneInverses.every((matrix, index) => matrixMatches(matrix, right.boneInverses[index]!));
}

/** Resolve only the base avatar skeleton. Already-rebound outfit meshes are
 * explicitly excluded, otherwise the second equipped skinned item would make
 * a whole-tree bone-name scan ambiguous. Multiple base meshes are accepted
 * only when they reference the same ordered live Bone objects and exact bind
 * pose within the bounded numeric tolerance. */
function resolveHostSkeleton(root: THREE.Object3D): THREE.Skeleton | null {
  let canonical: THREE.Skeleton | null = null;
  let conflict = false;
  root.traverse(node => {
    if (conflict || !(node as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mesh = node as THREE.SkinnedMesh;
    if (mesh.userData.aurionSharedRig || !skeletonMatches(mesh.skeleton)) return;
    const candidate = mesh.skeleton;
    if (!canonical) {
      canonical = candidate;
      return;
    }
    if (
      candidate.bones.length !== canonical.bones.length
      || candidate.bones.some((bone, index) => bone !== canonical!.bones[index])
      || !inverseBindPoseMatches(candidate, canonical)
    ) conflict = true;
  });
  return conflict ? null : canonical;
}

/**
 * Rebinds an already catalog-confirmed visual onto the exact shared 65-joint
 * presentation rig. The source geometry keeps its authored bind matrix and
 * inverse-bind matrices; only the live bone objects are replaced.
 *
 * Fail closed on missing/reordered/ambiguous joints or inverse-bind drift.
 * This function is render plumbing only and has no route to inventory,
 * equipment ownership, stats or WASD gameplay authority.
 */
export function rebindSharedHumanoidRigVisual(
  hostRoot: THREE.Object3D,
  visualRoot: THREE.Group,
): SharedRigRebindEvidence | null {
  const hostSkeleton = resolveHostSkeleton(hostRoot);
  if (!hostSkeleton) return null;

  const meshes: THREE.SkinnedMesh[] = [];
  visualRoot.traverse(node => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(node as THREE.SkinnedMesh);
  });
  if (
    !meshes.length
    || meshes.some(mesh => !skeletonMatches(mesh.skeleton) || !inverseBindPoseMatches(mesh.skeleton, hostSkeleton))
  ) return null;

  const hostBones = hostSkeleton.bones;
  for (const mesh of meshes) {
    const inverses = mesh.skeleton.boneInverses.map(matrix => matrix.clone());
    const bindMatrix = mesh.bindMatrix.clone();
    const skeleton = new THREE.Skeleton(hostBones, inverses);
    mesh.bindMode = THREE.DetachedBindMode;
    mesh.bind(skeleton, bindMatrix);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.aurionSharedRig = Object.freeze({
      version: SHARED_HUMANOID_RIG_VERSION,
      joints: SHARED_HUMANOID_RIG_JOINTS.length,
    });
  }
  visualRoot.userData.aurionSharedRig = Object.freeze({
    version: SHARED_HUMANOID_RIG_VERSION,
    joints: SHARED_HUMANOID_RIG_JOINTS.length,
    skinnedMeshes: meshes.length,
  });
  return Object.freeze({
    rigContract: SHARED_HUMANOID_RIG_VERSION,
    skinnedMeshes: meshes.length,
    joints: SHARED_HUMANOID_RIG_JOINTS.length,
  });
}
