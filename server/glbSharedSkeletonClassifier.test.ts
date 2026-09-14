import { describe, expect, it } from "vitest";
import { classifyGlbBase64 } from "./glbAssetClassifier";
import {
  SHARED_HUMANOID_RIG_JOINTS,
  SHARED_HUMANOID_RIG_VERSION,
} from "../shared/sharedHumanoidRigContract";

function glbBase64(json: Record<string, unknown>): string {
  const raw = Buffer.from(JSON.stringify(json), "utf8");
  const paddedLength = Math.ceil(raw.length / 4) * 4;
  const jsonChunk = Buffer.alloc(paddedLength, 0x20);
  raw.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length;
  const bytes = Buffer.alloc(totalLength);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(totalLength, 8);
  bytes.writeUInt32LE(jsonChunk.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(bytes, 20);
  return bytes.toString("base64");
}

function sharedRig(meshName: string, jointNames: readonly string[] = SHARED_HUMANOID_RIG_JOINTS) {
  const nodes = jointNames.map(name => ({ name }));
  return glbBase64({
    asset: { version: "2.0" },
    scenes: [{ name: "Scene", nodes: [0] }],
    nodes,
    meshes: [{ name: meshName, primitives: [] }],
    skins: [{ name: "Armature", joints: jointNames.map((_, index) => index) }],
  });
}

describe("Quaternius shared skeleton classifier", () => {
  it("accepts skinned modular armor only for the exact ordered 65-joint contract", () => {
    const result = classifyGlbBase64(sharedRig("Female_Ranger_Arms"), "Aurion_Equipment_arms_Female_Ranger_Arms_LOD0.glb");
    expect(result).toMatchObject({
      assetType: "armor",
      subcategory: "shared-rig-arms",
      equipmentSlot: "arms",
      confidence: "high",
      rigContract: SHARED_HUMANOID_RIG_VERSION,
      skinCount: 1,
    });
  });

  it("rejects a similarly named skinned outfit when joint order drifts", () => {
    const drifted = [...SHARED_HUMANOID_RIG_JOINTS];
    [drifted[8], drifted[9]] = [drifted[9]!, drifted[8]!];
    expect(() => classifyGlbBase64(
      sharedRig("Female_Ranger_Arms", drifted),
      "Aurion_Equipment_arms_Female_Ranger_Arms_LOD0.glb",
    )).toThrow("could not be classified safely");
  });

  it("keeps a complete shared-rig Character export on the character lane", () => {
    const result = classifyGlbBase64(sharedRig("Female_Peasant_Body"), "Aurion_Character_Female_Peasant_LOD0.glb");
    expect(result).toMatchObject({
      assetType: "character",
      subcategory: "rigged-character",
      rigContract: SHARED_HUMANOID_RIG_VERSION,
    });
  });
});
