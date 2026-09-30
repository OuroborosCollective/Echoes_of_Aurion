import * as THREE from "three";
import type { CanonicalAvatarBone, CanonicalAvatarProfile } from "@shared/aurionCanonicalAvatarContract";
import { verifyCanonicalAvatarProfile } from "@shared/aurionCanonicalAvatarContract";
import { browserCanonicalSha256 as canonicalSha256 } from "@shared/aurionBrowserHash";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";

export const EQUIPMENT_SKINNING_PROTOCOL = "aurion.equipment-skinning.v1" as const;
export const EQUIPMENT_SKINNING_VERSION = "aurion-equipment-skinning.v1" as const;

const MAX_INFLUENCES = 4;
const WEIGHT_UNITS = 65535;
const INFLUENCE_RADIUS_NORMALIZED = 0.22;
const PROFILE_RECONSTRUCTION_TOLERANCE = 0.02;
const DISTANCE_EPSILON = 0.0001;

type Vec3 = readonly [number, number, number];

type BoneSegment = Readonly<{
  boneId: string;
  skeletonIndex: number;
  start: Vec3;
  end: Vec3;
}>;

type QuantizedInfluence = Readonly<{
  skeletonIndex: number;
  boneId: string;
  units: number;
  distance: number;
}>;

export type EquipmentSkinningMeshEvidence = Readonly<{
  meshName: string;
  vertexCount: number;
  influencedVertices: number;
  maxInfluences: number;
  bindSpaceParent: string;
}>;

export type EquipmentSkinningContract = Readonly<{
  protocol: typeof EQUIPMENT_SKINNING_PROTOCOL;
  version: typeof EQUIPMENT_SKINNING_VERSION;
  descriptorHash: string;
  visualSeed: string;
  morphologyRecipeHash: string;
  avatarProfileFingerprint: string;
  avatarProfileVersion: string;
  skeletonRevision: string;
  policy: "surface-skin";
  maxInfluences: typeof MAX_INFLUENCES;
  weightQuantizationUnits: typeof WEIGHT_UNITS;
  meshEvidence: readonly EquipmentSkinningMeshEvidence[];
  vertexCount: number;
  weightFingerprint: string;
  skinningFingerprint: string;
}>;

type HostSkeleton = Readonly<{
  skeleton: THREE.Skeleton;
  mesh: THREE.SkinnedMesh;
}>;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function finiteVector(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function skeletonBoneMap(skeleton: THREE.Skeleton): Map<string, number> | null {
  const result = new Map<string, number>();
  skeleton.bones.forEach((bone, index) => {
    if (!bone.name) return;
    const key = normalize(bone.name);
    if (result.has(key)) {
      result.clear();
      result.set("__duplicate__", -1);
      return;
    }
    result.set(key, index);
  });
  return result.has("__duplicate__") ? null : result;
}

function resolveHostSkeleton(root: THREE.Object3D): HostSkeleton | null {
  let host: HostSkeleton | null = null;
  let conflict = false;
  root.traverse(node => {
    if (conflict || !(node as THREE.SkinnedMesh).isSkinnedMesh) return;
    const mesh = node as THREE.SkinnedMesh;
    if (mesh.userData.aurionEquipmentSkinning) return;
    if (!host) {
      host = { skeleton: mesh.skeleton, mesh };
      return;
    }
    if (
      mesh.skeleton !== host.skeleton
      && (
        mesh.skeleton.bones.length !== host.skeleton.bones.length
        || mesh.skeleton.bones.some((bone, index) => bone !== host!.skeleton.bones[index])
      )
    ) conflict = true;
  });
  return conflict ? null : host;
}

function canonicalBoneIndices(
  profile: CanonicalAvatarProfile,
  skeleton: THREE.Skeleton,
): Map<string, number> | null {
  const byName = skeletonBoneMap(skeleton);
  if (!byName) return null;
  const result = new Map<string, number>();
  for (const bone of profile.bones) {
    const index = byName.get(normalize(bone.sourceName));
    if (index === undefined) return null;
    result.set(bone.boneId, index);
  }
  return result;
}

function restBonePositionInAvatarRoot(
  avatarRoot: THREE.Object3D,
  boneInverse: THREE.Matrix4,
): THREE.Vector3 {
  const bindWorld = boneInverse.clone().invert();
  const position = new THREE.Vector3().setFromMatrixPosition(bindWorld);
  return avatarRoot.worldToLocal(position);
}

function reconstructNormalizationOrigin(
  avatarRoot: THREE.Object3D,
  profile: CanonicalAvatarProfile,
  skeleton: THREE.Skeleton,
  boneIndices: Map<string, number>,
  avatarHeightMeters: number,
): THREE.Vector3 | null {
  if (!Number.isFinite(avatarHeightMeters) || avatarHeightMeters <= 0) return null;
  const rootInverse = avatarRoot.matrixWorld.clone().invert();
  const offsets: THREE.Vector3[] = [];
  for (const bone of profile.bones) {
    const index = boneIndices.get(bone.boneId);
    if (index === undefined) return null;
    const inverseBind = skeleton.boneInverses[index];
    if (!inverseBind) return null;
    const bindWorld = inverseBind.clone().invert();
    bindWorld.premultiply(rootInverse);
    const actual = new THREE.Vector3().setFromMatrixPosition(bindWorld);
    if (!finiteVector(actual)) return null;
    offsets.push(
      actual.sub(
        new THREE.Vector3(
          bone.restPositionNormalized[0] * avatarHeightMeters,
          bone.restPositionNormalized[1] * avatarHeightMeters,
          bone.restPositionNormalized[2] * avatarHeightMeters,
        ),
      ),
    );
  }
  if (!offsets.length) return null;
  const origin = offsets.reduce(
    (sum, value) => sum.add(value),
    new THREE.Vector3(),
  ).multiplyScalar(1 / offsets.length);
  const residual = offsets.reduce(
    (max, value) => Math.max(max, value.distanceTo(origin)),
    0,
  );
  return residual <= avatarHeightMeters * PROFILE_RECONSTRUCTION_TOLERANCE ? origin : null;
}

function pointSegmentDistance(point: Vec3, start: Vec3, end: Vec3): number {
  const px = point[0] - start[0];
  const py = point[1] - start[1];
  const pz = point[2] - start[2];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared <= DISTANCE_EPSILON) return Math.hypot(px, py, pz);
  const t = Math.max(
    0,
    Math.min(1, (px * dx + py * dy + pz * dz) / lengthSquared),
  );
  const cx = px - dx * t;
  const cy = py - dy * t;
  const cz = pz - dz * t;
  return Math.hypot(cx, cy, cz);
}

function buildSegments(
  profile: CanonicalAvatarProfile,
  boneIndices: Map<string, number>,
): BoneSegment[] {
  const byId = new Map(profile.bones.map(bone => [bone.boneId, bone]));
  return profile.bones
    .map((bone: CanonicalAvatarBone) => {
      const parent = bone.parentBoneId ? byId.get(bone.parentBoneId) : null;
      return Object.freeze({
        boneId: bone.boneId,
        skeletonIndex: boneIndices.get(bone.boneId)!,
        start: bone.restPositionNormalized,
        end: parent?.restPositionNormalized ?? bone.restPositionNormalized,
      });
    })
    .sort(
      (left, right) =>
        left.boneId.localeCompare(right.boneId)
        || left.skeletonIndex - right.skeletonIndex,
    );
}

function quantizeInfluences(
  ranked: readonly Readonly<{ segment: BoneSegment; distance: number }>[],
): QuantizedInfluence[] {
  const selected = ranked.slice(0, MAX_INFLUENCES);
  const withinRadius = selected.filter(
    value => value.distance <= INFLUENCE_RADIUS_NORMALIZED,
  );
  const candidates = withinRadius.length ? withinRadius : selected.slice(0, 1);
  if (!candidates.length) return [];

  const raw = candidates.map(value => ({
    ...value,
    rawWeight:
      candidates.length === 1
        ? 1
        : 1 / Math.pow(Math.max(value.distance, DISTANCE_EPSILON), 2),
  }));
  const total = raw.reduce((sum, value) => sum + value.rawWeight, 0);
  const provisional = raw.map(value => ({
    ...value,
    exactUnits: value.rawWeight / total * WEIGHT_UNITS,
    units: Math.floor(value.rawWeight / total * WEIGHT_UNITS),
  }));
  let remaining = WEIGHT_UNITS - provisional.reduce((sum, value) => sum + value.units, 0);
  provisional
    .slice()
    .sort(
      (left, right) =>
        (right.exactUnits - Math.floor(right.exactUnits))
          - (left.exactUnits - Math.floor(left.exactUnits))
        || left.segment.skeletonIndex - right.segment.skeletonIndex,
    )
    .forEach(value => {
      if (remaining <= 0) return;
      value.units += 1;
      remaining -= 1;
    });
  return provisional
    .sort((left, right) =>
      left.segment.skeletonIndex - right.segment.skeletonIndex)
    .map(value => Object.freeze({
      skeletonIndex: value.segment.skeletonIndex,
      boneId: value.segment.boneId,
      units: value.units,
      distance: value.distance,
    }));
}

function setSkinAttributes(
  geometry: THREE.BufferGeometry,
  mesh: THREE.Mesh,
  avatarRoot: THREE.Object3D,
  origin: THREE.Vector3,
  avatarHeightMeters: number,
  segments: readonly BoneSegment[],
  fingerprintParts: string[],
): number {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  const matrix = avatarRoot.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const indices = new Uint16Array(position.count * MAX_INFLUENCES);
  const weights = new Float32Array(position.count * MAX_INFLUENCES);
  let influenced = 0;
  for (let index = 0; index < position.count; index += 1) {
    const vertex = new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index))
      .applyMatrix4(matrix);
    const normalized: Vec3 = [
      (vertex.x - origin.x) / avatarHeightMeters,
      (vertex.y - origin.y) / avatarHeightMeters,
      (vertex.z - origin.z) / avatarHeightMeters,
    ];
    const ranked = segments
      .map(segment => ({
        segment,
        distance: pointSegmentDistance(normalized, segment.start, segment.end),
      }))
      .sort(
        (left, right) =>
          left.distance - right.distance
          || left.segment.skeletonIndex - right.segment.skeletonIndex
          || left.segment.boneId.localeCompare(right.segment.boneId),
      );
    const influences = quantizeInfluences(ranked);
    for (let influence = 0; influence < MAX_INFLUENCES; influence += 1) {
      const current = influences[influence];
      const target = index * MAX_INFLUENCES + influence;
      indices[target] = current?.skeletonIndex ?? 0;
      weights[target] = (current?.units ?? 0) / WEIGHT_UNITS;
      fingerprintParts.push(
        mesh.name,
        String(index),
        String(influence),
        current?.boneId ?? "-",
        String(current?.units ?? 0),
      );
    }
    if (influences.length) influenced += 1;
  }
  geometry.deleteAttribute("skinIndex");
  geometry.deleteAttribute("skinWeight");
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, MAX_INFLUENCES));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, MAX_INFLUENCES));
  return influenced;
}

function rebindMeshToHostSkeleton(
  source: THREE.Mesh,
  hostMesh: THREE.SkinnedMesh,
): THREE.SkinnedMesh {
  const sourceGeometry = source.geometry;
  const geometry = sourceGeometry.clone();
  const skinned = new THREE.SkinnedMesh(geometry, source.material);
  skinned.name = source.name;
  skinned.visible = source.visible;
  skinned.castShadow = false;
  skinned.receiveShadow = true;
  skinned.position.copy(source.position);
  skinned.quaternion.copy(source.quaternion);
  skinned.scale.copy(source.scale);
  skinned.bind(hostMesh.skeleton, hostMesh.bindMatrix.clone());
  skinned.userData.aurionEquipmentSkinning = Object.freeze({
    version: EQUIPMENT_SKINNING_VERSION,
    sourceMesh: source.name,
  });
  source.parent?.add(skinned);
  source.removeFromParent();
  sourceGeometry.dispose();
  return skinned;
}

/**
 * Convert generated, fitted armor meshes from static geometry into shared-skeleton
 * presentation meshes. The weight solver depends only on the canonical avatar
 * rest skeleton, not the current animation pose, so compiling while Idle/Walk/Run
 * is active cannot alter the skinning identity.
 */
export function compileEquipmentSkinning(
  descriptor: VisualItemDescriptor,
  visualRoot: THREE.Group,
  morphologyRecipeHash: string,
  avatarRoot: THREE.Object3D,
  profile: CanonicalAvatarProfile,
  avatarHeightMeters: number,
): EquipmentSkinningContract | null {
  if (
    descriptor.category !== "armor"
    || !verifyCanonicalAvatarProfile(profile)
    || !morphologyRecipeHash.trim()
    || !visualRoot.children.length
  ) return null;
  if (profile.deformationMode === "rigid") return null;

  avatarRoot.updateMatrixWorld(true);
  visualRoot.updateMatrixWorld(true);
  const host = resolveHostSkeleton(avatarRoot);
  if (!host) return null;
  const boneIndices = canonicalBoneIndices(profile, host.skeleton);
  if (!boneIndices) return null;
  const origin = reconstructNormalizationOrigin(
    avatarRoot,
    profile,
    host.skeleton,
    boneIndices,
    avatarHeightMeters,
  );
  if (!origin) return null;
  const segments = buildSegments(profile, boneIndices);
  const meshes: THREE.Mesh[] = [];
  visualRoot.traverse(node => {
    if ((node as THREE.Mesh).isMesh && !(node as THREE.SkinnedMesh).isSkinnedMesh) {
      meshes.push(node as THREE.Mesh);
    }
  });
  if (!meshes.length) return null;

  const fingerprintParts: string[] = [
    descriptor.source.deterministicHash,
    descriptor.visualSeed,
    morphologyRecipeHash,
    profile.profileFingerprint,
    profile.skeletonRevision,
    EQUIPMENT_SKINNING_VERSION,
    String(avatarHeightMeters),
  ];
  const meshEvidence: EquipmentSkinningMeshEvidence[] = [];
  let vertexCount = 0;
  for (const mesh of meshes) {
    const evidenceVertexCount = mesh.geometry.getAttribute("position")?.count ?? 0;
    if (!evidenceVertexCount) return null;
    const influencedVertices = setSkinAttributes(
      mesh.geometry,
      mesh,
      avatarRoot,
      origin,
      avatarHeightMeters,
      segments,
      fingerprintParts,
    );
    if (influencedVertices !== evidenceVertexCount) return null;
    const skinned = bakeMeshIntoHostSpace(mesh, host.mesh);
    meshEvidence.push(Object.freeze({
      meshName: skinned.name,
      vertexCount: evidenceVertexCount,
      influencedVertices,
      maxInfluences: MAX_INFLUENCES,
      bindSpaceParent: host.mesh.parent?.name ?? "root",
    }));
    vertexCount += evidenceVertexCount;
  }
  const weightFingerprint = canonicalSha256({
    domain: "aurion.equipment-skinning.weights.v1",
    fingerprintParts,
  });
  const skinningFingerprint = canonicalSha256({
    domain: "aurion.equipment-skinning.v1",
    descriptorHash: descriptor.source.deterministicHash,
    visualSeed: descriptor.visualSeed,
    morphologyRecipeHash,
    avatarProfileFingerprint: profile.profileFingerprint,
    skeletonRevision: profile.skeletonRevision,
    weightFingerprint,
    meshEvidence,
  });
  visualRoot.userData.aurionEquipmentSkinning = Object.freeze({
    version: EQUIPMENT_SKINNING_VERSION,
    weightFingerprint,
    skinningFingerprint,
    vertexCount,
  });
  return Object.freeze({
    protocol: EQUIPMENT_SKINNING_PROTOCOL,
    version: EQUIPMENT_SKINNING_VERSION,
    descriptorHash: descriptor.source.deterministicHash,
    visualSeed: descriptor.visualSeed,
    morphologyRecipeHash,
    avatarProfileFingerprint: profile.profileFingerprint,
    avatarProfileVersion: profile.avatarProfileVersion,
    skeletonRevision: profile.skeletonRevision,
    policy: "surface-skin",
    maxInfluences: MAX_INFLUENCES,
    weightQuantizationUnits: WEIGHT_UNITS,
    meshEvidence: Object.freeze(meshEvidence),
    vertexCount,
    weightFingerprint,
    skinningFingerprint,
  });
}
