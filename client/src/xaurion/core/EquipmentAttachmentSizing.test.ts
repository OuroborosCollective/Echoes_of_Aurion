import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AnimatedGlbActor, animationClipHasMotion } from "./AnimatedGlbActor";
import { equipmentAnchorAliases, equipmentAttachmentOffset, equipmentLocalScale, equipmentTargetHeightFraction } from "./EquipmentAttachmentSizing";

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

  it("uses an authored attachment origin before the legacy bounds center", () => {
    const visual = new THREE.Group();
    const geometry = new THREE.BoxGeometry(2, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(4, 0, 0);
    visual.add(mesh);
    const origin = new THREE.Object3D();
    origin.name = "AurionAttachmentOrigin";
    origin.position.set(1, 0.25, -0.5);
    visual.add(origin);
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual, true);
    const authoredOffset = equipmentAttachmentOffset("weapon", visual, bounds, 0.5);
    expect(authoredOffset?.toArray()).toEqual([-0.5, -0.125, 0.25]);

    origin.removeFromParent();
    visual.updateMatrixWorld(true);
    const legacyBounds = new THREE.Box3().setFromObject(visual, true);
    const legacyOffset = equipmentAttachmentOffset("weapon", visual, legacyBounds, 0.5);
    expect(legacyOffset?.x).toBeCloseTo(-2, 6);
    expect(legacyOffset?.y).toBeCloseTo(0, 6);
    expect(legacyOffset?.z).toBeCloseTo(0, 6);
    geometry.dispose();
    material.dispose();
  });

  it("lands an authored equipment origin exactly on the live actor socket", () => {
    const model = new THREE.Group();
    const bodyGeometry = new THREE.BoxGeometry(0.7, 2, 0.35);
    const bodyMaterial = new THREE.MeshBasicMaterial();
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1;
    model.add(body);
    const socket = new THREE.Object3D();
    socket.name = "AurionSlotMainHand";
    socket.position.set(0.45, 1.25, 0.1);
    model.add(socket);
    const actor = new AnimatedGlbActor(model, [], 2);

    const visual = new THREE.Group();
    const equipmentGeometry = new THREE.BoxGeometry(0.2, 1.2, 0.1);
    const equipmentMaterial = new THREE.MeshBasicMaterial();
    const equipmentMesh = new THREE.Mesh(equipmentGeometry, equipmentMaterial);
    equipmentMesh.position.y = 0.6;
    visual.add(equipmentMesh);
    const origin = new THREE.Object3D();
    origin.name = "AurionAttachmentOrigin";
    origin.position.set(0, 0.1, 0);
    visual.add(origin);

    expect(actor.attachEquipment("weapon", visual)).toBe(true);
    actor.group.updateMatrixWorld(true);
    socket.updateWorldMatrix(true, true);
    origin.updateWorldMatrix(true, false);
    const socketWorld = socket.getWorldPosition(new THREE.Vector3());
    const originWorld = origin.getWorldPosition(new THREE.Vector3());
    expect(originWorld.distanceTo(socketWorld)).toBeLessThan(1e-6);
    expect(actor.evidence().equipmentSlots).toContain("weapon");

    actor.dispose();
    bodyGeometry.dispose();
    bodyMaterial.dispose();
    equipmentGeometry.dispose();
    equipmentMaterial.dispose();
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
