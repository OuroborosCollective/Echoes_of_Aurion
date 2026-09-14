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

function skeletonMatches(skeleton: THREE.Skeleton): boolean {
  return matchesSharedHumanoidRigJointNames(skeleton.bones.map(bone => bone.name))
    && skeleton.boneInverses.length === SHARED_HUMANOID_RIG_JOINTS.length;
}

/** Resolve only the base avatar skeleton. Already-rebound outfit meshes are
 * explicitly excluded, otherwise the second equipped skinned item would make
 * a whole-tree bone-name scan ambiguous. Multiple base meshes are accepted
 * only when they reference the same ordered live Bone objects. */
function hostSkeletonBones(root: THREE.Object3D): THREE.Bone[] | null {
  let canonical: THREE.Bone[] | null = null;
  let conflict = false;
  root.traverse(node => {
    if (conflict || !(node as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mesh = node as THREE.SkinnedMesh;
    if (mesh.userData.aurionSharedRig || !skeletonMatches(mesh.skeleton)) return;
    const candidate = mesh.skeleton.bones;
    if (!canonical) {
      canonical = candidate.slice();
      return;
    }
    if (candidate.length !== canonical.length || candidate.some((bone, index) => bone !== canonical![index])) conflict = true;
  });
  return conflict ? null : canonical;
}

/**
 * Rebinds an already catalog-confirmed visual onto the exact shared 65-joint
 * presentation rig. The source geometry keeps its authored bind matrix and
 * inverse-bind matrices; only the live bone objects are replaced.
 *
 * Fail closed on missing/reordered/ambiguous joints. This function is render
 * plumbing only and has no route to inventory, equipment ownership, stats or
 * WASD gameplay authority.
 */
export function rebindSharedHumanoidRigVisual(
  hostRoot: THREE.Object3D,
  visualRoot: THREE.Group,
): SharedRigRebindEvidence | null {
  const hostBones = hostSkeletonBones(hostRoot);
  if (!hostBones) return null;

  const meshes: THREE.SkinnedMesh[] = [];
  visualRoot.traverse(node => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(node as THREE.SkinnedMesh);
  });
  if (!meshes.length || meshes.some(mesh => !skeletonMatches(mesh.skeleton))) return null;

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
