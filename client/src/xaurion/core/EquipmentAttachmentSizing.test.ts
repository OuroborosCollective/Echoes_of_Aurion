import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AnimatedGlbActor } from "./AnimatedGlbActor";
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

  it("prefers canonical Aurion equipment anchors while retaining legacy aliases", () => {
    expect(equipmentAnchorAliases.weapon[0]).toBe("aurionslotmainhand");
    expect(equipmentAnchorAliases.shield[0]).toBe("aurionslotshield");
    expect(equipmentAnchorAliases.helmet[0]).toBe("aurionslothead");
    expect(equipmentAnchorAliases.weapon).toContain("socketweaponr");
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
    actor.dispose();
  });
});
