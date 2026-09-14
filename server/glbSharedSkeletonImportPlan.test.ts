import { describe, expect, it } from "vitest";
import { buildGlbImportPlan } from "./glbImportPlan";
import {
  SHARED_HUMANOID_RIG_JOINTS,
  SHARED_HUMANOID_RIG_VERSION,
} from "../shared/sharedHumanoidRigContract";

function selfContainedSharedRigGlb(): string {
  const nodes = SHARED_HUMANOID_RIG_JOINTS.map((name, index) => ({
    name,
    ...(index + 1 < SHARED_HUMANOID_RIG_JOINTS.length ? { children: [index + 1] } : {}),
  }));
  nodes.push({ name: "Female_Ranger_Arms", mesh: 0, skin: 0 } as never);
  const binary = Buffer.alloc(36);
  new Float32Array(binary.buffer, binary.byteOffset, 9).set([
    0, 0, 0,
    0, 1, 0,
    1, 0, 0,
  ]);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [0, SHARED_HUMANOID_RIG_JOINTS.length] }],
    nodes,
    meshes: [{ name: "Female_Ranger_Arms", primitives: [{ attributes: { POSITION: 0 } }] }],
    skins: [{ name: "Armature", joints: SHARED_HUMANOID_RIG_JOINTS.map((_, index) => index), skeleton: 0 }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }],
    accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3" }],
  };
  const rawJson = Buffer.from(JSON.stringify(json), "utf8");
  const jsonLength = Math.ceil(rawJson.length / 4) * 4;
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  rawJson.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const glb = Buffer.alloc(totalLength);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryHeader = 20 + jsonChunk.length;
  glb.writeUInt32LE(binary.length, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(glb, binaryHeader + 8);
  return glb.toString("base64");
}

describe("shared-skeleton GLB import plan", () => {
  it("binds exact rig identity into an equipment plan", () => {
    const plan = buildGlbImportPlan(
      selfContainedSharedRigGlb(),
      "equipment",
      "Aurion_Equipment_arms_Female_Ranger_Arms_LOD0.glb",
    );
    expect(plan).toMatchObject({
      purpose: "equipment",
      assetType: "armor",
      subcategory: "shared-rig-arms",
      equipmentSlot: "arms",
      rigContract: SHARED_HUMANOID_RIG_VERSION,
      targetKey: null,
      classification: {
        rigContract: SHARED_HUMANOID_RIG_VERSION,
        skinCount: 1,
        equipmentSlot: "arms",
      },
    });
    expect(plan.planSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
