import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AnimatedGlbActor } from "../client/src/xaurion/core/AnimatedGlbActor";
import { buildGlbImportPlan } from "./glbImportPlan";

async function geometryAndRig(file: string) {
  const original = readFileSync(file.includes("/") ? file : `test/fixtures/aurion-glb/${file}`);
  const jsonEnd = 20 + original.readUInt32LE(12);
  const gltf = JSON.parse(original.subarray(20, jsonEnd).toString());
  // Node has no image decoder. Preserve the exact geometry/rig/animation buffer;
  // texture loading and rendering are tested with the complete GLBs in browser CI.
  delete gltf.images; delete gltf.textures; delete gltf.materials;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const output = Buffer.alloc(20 + padded.length + original.length - jsonEnd);
  original.copy(output, 0, 0, 12); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(padded.length, 12); output.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(output, 20); original.copy(output, 20 + padded.length, jsonEnd);
  return new GLTFLoader().parseAsync(output.buffer.slice(output.byteOffset, output.byteOffset + output.length), "");
}

describe("owner-supplied Aurion actors", () => {
  it("assigns the smith independently of the player without using the upload filename", () => {
    const smith = buildGlbImportPlan(readFileSync("test/fixtures/aurion-glb/blacksmith-npc.glb").toString("base64"));
    const player = buildGlbImportPlan(readFileSync("test/fixtures/aurion-glb/aurion-player-standard.glb").toString("base64"));
    expect(smith.targetKey).toBe("npc_blacksmith");
    expect(player.targetKey).toBe("starter_player");
    expect(smith.classification.animationNames).toEqual(["Idle", "ShopInteract"]);
  });
  it("sizes and grounds the actual player, advances bone poses and switches walk/run/idle", async () => {
    const gltf = await geometryAndRig("assets/characters/aurion-player-standard-animated.glb");
    const actor = new AnimatedGlbActor(gltf.scene, gltf.animations, 2);
    actor.group.updateMatrixWorld(true);
    const initial = new THREE.Box3().setFromObject(actor.group, true);
    expect(initial.max.y - initial.min.y).toBeCloseTo(2, 1);
    expect(Math.abs(initial.min.y)).toBeLessThan(0.06);
    const before = actor.evidence().bonePose;
    actor.update(0.2);
    expect(actor.evidence().bonePose).not.toBe(before);
    actor.setLocomotion(2);
    expect(actor.evidence().clip).toBe("Walk");
    const walking = actor.evidence().bonePose; actor.update(0.2);
    expect(actor.evidence().bonePose).not.toBe(walking);
    actor.setLocomotion(6); expect(actor.evidence().clip).toBe("Run");
    const scene = new THREE.Scene(), playerRoot = new THREE.Group(), avatarSlot = new THREE.Group();
    scene.add(playerRoot); playerRoot.add(avatarSlot); avatarSlot.add(actor.group);
    scene.updateMatrixWorld(true);
    playerRoot.position.set(12, 3.25, -7);
    for (let i = 0; i < 20; i++) {
      playerRoot.position.x += 0.1;
      playerRoot.rotation.y += 0.05;
      actor.update(0.1);
      expect(new THREE.Box3().setFromObject(actor.group, true).min.y).toBeCloseTo(3.25, 4);
    }
    actor.setLocomotion(0); expect(actor.evidence().clip).toBe("Idle");
    actor.playOnce("attack"); expect(actor.evidence().clip).toBe("AttackCombo");
    for (let i = 0; i < 80; i++) actor.update(0.1);
    expect(actor.evidence().clip).toBe("Idle");
    actor.dispose();
  });
  it("plays the smith interaction once, returns to idle and retires cleanly", async () => {
    const gltf = await geometryAndRig("blacksmith-npc.glb");
    const actor = new AnimatedGlbActor(gltf.scene, gltf.animations, 2);
    actor.playOnce("interact");
    expect(actor.evidence().clip).toBe("ShopInteract");
    for (let i = 0; i < 30; i++) actor.update(0.1);
    expect(actor.evidence().clip).toBe("Idle");
    actor.dispose(); const time = actor.evidence().clipTime; actor.update(0.2);
    expect(actor.evidence().clipTime).toBe(time);
  });
});
