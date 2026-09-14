import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  SHARED_HUMANOID_RIG_JOINTS,
  SHARED_HUMANOID_RIG_VERSION,
} from "@shared/sharedHumanoidRigContract";
import { rebindSharedHumanoidRigVisual } from "./SharedHumanoidRig";

function bones(names: readonly string[]) {
  const result = names.map(name => {
    const bone = new THREE.Bone();
    bone.name = name;
    return bone;
  });
  for (let index = 1; index < result.length; index += 1) result[index - 1]!.add(result[index]!);
  return result;
}

function skinnedMesh(name: string, ordered: THREE.Bone[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  mesh.bind(new THREE.Skeleton(ordered));
  return mesh;
}

function host(names: readonly string[] = SHARED_HUMANOID_RIG_JOINTS) {
  const root = new THREE.Group();
  const ordered = bones(names);
  root.add(ordered[0]!);
  const mesh = skinnedMesh("shared-rig-host", ordered);
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, ordered, mesh };
}

function visual(names: readonly string[] = SHARED_HUMANOID_RIG_JOINTS) {
  const root = new THREE.Group();
  const ordered = bones(names);
  root.add(ordered[0]!);
  const mesh = skinnedMesh("shared-rig-outfit", ordered);
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh, ordered };
}

describe("SharedHumanoidRig", () => {
  it("rebinds an exact ordered 65-joint visual onto host bones", () => {
    const target = host();
    const source = visual();
    const evidence = rebindSharedHumanoidRigVisual(target.root, source.root);

    expect(evidence).toEqual({
      rigContract: SHARED_HUMANOID_RIG_VERSION,
      skinnedMeshes: 1,
      joints: 65,
    });
    expect(source.mesh.bindMode).toBe(THREE.DetachedBindMode);
    expect(source.mesh.skeleton.bones).toHaveLength(65);
    expect(source.mesh.skeleton.bones.every((bone, index) => bone === target.ordered[index])).toBe(true);
    expect(source.root.userData.aurionSharedRig).toMatchObject({ version: SHARED_HUMANOID_RIG_VERSION, joints: 65 });
  });

  it("keeps the base host resolvable after one shared-rig visual was attached", () => {
    const target = host();
    const first = visual();
    expect(rebindSharedHumanoidRigVisual(target.root, first.root)).not.toBeNull();
    target.root.add(first.root);
    const second = visual();
    expect(rebindSharedHumanoidRigVisual(target.root, second.root)).not.toBeNull();
    expect(second.mesh.skeleton.bones.every((bone, index) => bone === target.ordered[index])).toBe(true);
  });

  it("fails closed when the host omits one required joint", () => {
    const target = host(SHARED_HUMANOID_RIG_JOINTS.slice(0, -1));
    const source = visual();
    expect(rebindSharedHumanoidRigVisual(target.root, source.root)).toBeNull();
    expect(source.mesh.skeleton.bones[0]).toBe(source.ordered[0]);
  });

  it("fails closed when source joint order is not the canonical order", () => {
    const target = host();
    const drifted = [...SHARED_HUMANOID_RIG_JOINTS];
    [drifted[8], drifted[9]] = [drifted[9]!, drifted[8]!];
    const source = visual(drifted);
    expect(rebindSharedHumanoidRigVisual(target.root, source.root)).toBeNull();
    expect(source.mesh.skeleton.bones[0]).toBe(source.ordered[0]);
  });

  it("fails closed when source inverse-bind pose drifts despite matching joint names", () => {
    const target = host();
    const source = visual();
    const originalSkeleton = source.mesh.skeleton;
    source.mesh.skeleton.boneInverses[10]!.elements[12] += 0.1;

    expect(rebindSharedHumanoidRigVisual(target.root, source.root)).toBeNull();
    expect(source.mesh.skeleton).toBe(originalSkeleton);
    expect(source.mesh.skeleton.bones[0]).toBe(source.ordered[0]);
  });

  it("fails closed when host meshes share bones but disagree on inverse-bind pose", () => {
    const target = host();
    const secondHostMesh = skinnedMesh("shared-rig-host-secondary", target.ordered);
    secondHostMesh.skeleton.boneInverses[12]!.elements[13] += 0.1;
    target.root.add(secondHostMesh);
    const source = visual();

    expect(rebindSharedHumanoidRigVisual(target.root, source.root)).toBeNull();
    expect(source.mesh.skeleton.bones[0]).toBe(source.ordered[0]);
  });
});
