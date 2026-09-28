import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { extractCanonicalAvatarProfile } from "./CanonicalAvatarProfile";

const names = [
  "root",
  "pelvis",
  "spine",
  "chest",
  "neck",
  "head",
  "upperarml",
  "upperarmr",
  "forearml",
  "forearmr",
  "handl",
  "handr",
  "thighl",
  "thighr",
  "shinl",
  "shinr",
  "footl",
  "footr",
] as const;

function model(): THREE.Group {
  const root = new THREE.Group();
  const armature = new THREE.Group();
  root.add(armature);
  let parent: THREE.Object3D = armature;
  for (const name of names) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.y = name === "head" ? 1.8 : name.includes("foot") ? 0.1 : 0.4;
    parent.add(bone);
    parent = bone;
  }
  const geometry = new THREE.BoxGeometry(0.6, 2, 0.4);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.y = 1;
  root.add(mesh);
  root.updateMatrixWorld(true);
  return root;
}

describe("CanonicalAvatarProfile GLB extractor", () => {
  it("extracts a normalized, LOD-independent profile and fingerprint", () => {
    const first = extractCanonicalAvatarProfile(model(), {
      avatarProfileId: "glb:reference",
    });
    const replay = extractCanonicalAvatarProfile(model(), {
      avatarProfileId: "glb:reference",
    });
    expect(first.profileFingerprint).toBe(replay.profileFingerprint);
    expect(first.protocol).toBe("aurion-canonical-avatar.v1");
    expect(first.bones).toHaveLength(names.length);
    expect(first.bodyRegions).toHaveLength(18);
    expect(first.attachmentSockets.length).toBeGreaterThan(0);
    expect(first.normalizedBounds.min[1]).toBeCloseTo(0, 8);
    expect(first.normalizedBounds.max[1]).toBeCloseTo(1, 8);
  });

  it("fails closed when the canonical skeleton is incomplete", () => {
    expect(() =>
      extractCanonicalAvatarProfile(new THREE.Group(), {
        avatarProfileId: "glb:invalid",
      })
    ).toThrow("CANONICAL_AVATAR_BOUNDS_INVALID");
  });
});
