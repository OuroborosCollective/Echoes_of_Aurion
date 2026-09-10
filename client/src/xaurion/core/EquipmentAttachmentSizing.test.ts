import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AnimatedGlbActor, animationClipHasMotion } from "./AnimatedGlbActor";
import { equipmentAnchorAliases, equipmentLocalScale, equipmentTargetHeightFraction } from "./EquipmentAttachmentSizing";

describe("Aurion standard player equipment sizing", () => {
  it("keeps helmet and armor sizing relative to the normalized avatar instead of source GLB units", () => {
    const avatarHeight = 2;
    const centimeterAssetScale = 0.01;
    const helmet = equipmentLocalScale("helmet", 100, avatarHeight, centimeterAssetScale);
    const sword = equipmentLocalScale("weapon", 300, avatarHeight, centimeterAssetScale);
    expect(helmet).not.toBeNull();
    expect(sword).not.toBeNull();
    expect(100 * centimeterAssetScale * helmet!).toBeCloseTo(avatarHeight * equipmentTargetHeightFraction.helmet, 6);
    expect(300 * centimeterAssetScale * sword!).toBeCloseTo(avatarHeight * equipmentTargetHeightFraction.weapon, 6);
    expect(avatarHeight * equipmentTargetHeightFraction.helmet).toBeLessThan(avatarHeight / 2);
  });

  it("fails closed on degenerate visual or parent scales", () => {
    expect(equipmentLocalScale("helmet", 0, 2, 1)).toBeNull();
    expect(equipmentLocalScale("helmet", 1, Number.NaN, 1)).toBeNull();
    expect(equipmentLocalScale("helmet", 1, 2, 0)).toBeNull();
  });

  it("prefers canonical Aurion equipment anchors while retaining common imported rig aliases", () => {
    expect(equipmentAnchorAliases.weapon[0]).toBe("aurionslotmainhand");
    expect(equipmentAnchorAliases.shield[0]).toBe("aurionslotshield");
    expect(equipmentAnchorAliases.helmet[0]).toBe("aurionslothead");
    expect(equipmentAnchorAliases.weapon).toContain("socketweaponr");
    expect(equipmentAnchorAliases.weapon).toContain("mixamorigrighthand");
    expect(equipmentAnchorAliases.weapon).toContain("rightwrist");
    expect(equipmentAnchorAliases.weapon).toContain("ccbaserhand");
    expect(equipmentAnchorAliases.shield).toContain("mixamoriglefthand");
  });

  it("distinguishes real keyframe motion from clip-name-only animation", () => {
    const staticTrack = new THREE.QuaternionKeyframeTrack(
      "upperarm_l.quaternion",
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1],
    );
    const movingTrack = new THREE.QuaternionKeyframeTrack(
      "upperarm_l.quaternion",
      [0, 1],
      [0, 0, 0, 1, 0.258819, 0, 0, 0.965926],
    );
    expect(animationClipHasMotion(new THREE.AnimationClip("Idle", 1, [staticTrack]))).toBe(false);
    expect(animationClipHasMotion(new THREE.AnimationClip("Idle", 1, [movingTrack]))).toBe(true);
  });

  it("relaxes lowercase upperarm bones used by the supplied male/female rigs", () => {
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.35), new THREE.MeshBasicMaterial());
    body.position.y = 1;
    model.add(body);
    const left = new THREE.Bone(); left.name = "upperarm_l"; left.position.set(-0.4, 1.65, 0);
    const right = new THREE.Bone(); right.name = "upperarm_r"; right.position.set(0.4, 1.65, 0);
    model.add(left, right);
    const beforeLeft = left.quaternion.clone();
    const beforeRight = right.quaternion.clone();
    const actor = new AnimatedGlbActor(model, [new THREE.AnimationClip("Idle", 1, [])], 2);
    expect(left.quaternion.equals(beforeLeft)).toBe(false);
    expect(right.quaternion.equals(beforeRight)).toBe(false);
    left.updateWorldMatrix(true, false);
    right.updateWorldMatrix(true, false);
    const localAxis = new THREE.Vector3(0, 1, 0);
    expect(localAxis.clone().applyQuaternion(left.getWorldQuaternion(new THREE.Quaternion())).normalize().y).toBeLessThan(0);
    expect(localAxis.clone().applyQuaternion(right.getWorldQuaternion(new THREE.Quaternion())).normalize().y).toBeLessThan(0);
    expect(actor.evidence().fallbackPoses).toContain("idle");
    actor.dispose();
  });

  it("uses presentation-only locomotion when a rig advertises a static Walk clip", () => {
    const model = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.35), new THREE.MeshBasicMaterial());
    body.position.y = 1;
    model.add(body);
    for (const [name, x, y] of [
      ["upperarm_l", -0.4, 1.65], ["upperarm_r", 0.4, 1.65],
      ["thigh_l", -0.2, 0.95], ["thigh_r", 0.2, 0.95],
      ["shin_l", -0.2, 0.5], ["shin_r", 0.2, 0.5],
    ] as const) {
      const bone = new THREE.Bone(); bone.name = name; bone.position.set(x, y, 0); model.add(bone);
    }
    const actor = new AnimatedGlbActor(model, [new THREE.AnimationClip("Idle", 1, []), new THREE.AnimationClip("Walk", 1, [])], 2);
    actor.setLocomotion(1.5);
    const before = actor.evidence().bonePose;
    actor.update(0.12);
    const first = actor.evidence().bonePose;
    actor.update(0.12);
    expect(first).not.toBe(before);
    expect(actor.evidence().bonePose).not.toBe(first);
    expect(actor.evidence().fallbackPoses).toContain("walk");
    expect(actor.evidence().animatedPoses).not.toContain("walk");
    actor.dispose();
  });
});
