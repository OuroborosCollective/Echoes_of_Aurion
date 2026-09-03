import { describe, expect, it } from "vitest";
import { classifyGlbBase64 } from "./glbAssetClassifier";

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

function animationNames(names: readonly string[]) {
  return names.map(name => ({ name, channels: [], samplers: [] }));
}

describe("GLB asset classifier", () => {
  it("classifies the standardized Aurion player rig as a character from sockets and player clips", () => {
    const result = classifyGlbBase64(glbBase64({
      asset: { version: "2.0" },
      scenes: [{ name: "Scene", nodes: [0] }],
      nodes: [
        { name: "Root" }, { name: "Aurion_Humanoid_Rig" },
        { name: "Socket_Head" }, { name: "Socket_Chest" }, { name: "Socket_Hand_L" }, { name: "Socket_Hand_R" },
        { name: "Socket_Weapon_L" }, { name: "Socket_Weapon_R" },
      ],
      meshes: [{ name: "Aurion_Player_Mesh", primitives: [] }],
      skins: [{ name: "Aurion_Humanoid_Rig", joints: [0] }],
      animations: animationNames(["AttackCombo", "Death", "Fight", "Idle", "Jump", "Run", "Walk"]),
    }));
    expect(result).toMatchObject({ assetType: "character", subcategory: "standardized-humanoid", confidence: "high", skinCount: 1 });
    expect(result.socketCount).toBeGreaterThanOrEqual(4);
  });

  it("classifies an eight-legged combat rig as the starter spider enemy", () => {
    const legs = Array.from({ length: 4 }, (_, index) => index + 1).flatMap(index => [
      { name: `Leg_L${index}_Upper` }, { name: `Leg_R${index}_Upper` },
    ]);
    const result = classifyGlbBase64(glbBase64({
      asset: { version: "2.0" },
      nodes: [{ name: "Spider_Monster_Rig" }, { name: "Body" }, ...legs],
      meshes: [{ name: "Spider_Mesh", primitives: [] }],
      skins: [{ name: "Spider_Monster_Rig", joints: [0] }],
      animations: animationNames(["Idle", "Walk", "Attack", "Death"]),
    }));
    expect(result).toMatchObject({ assetType: "enemy", subcategory: "spider", confidence: "high" });
  });

  it("classifies the humanoid starter monster LOD set as enemy LODs instead of player characters", () => {
    const result = classifyGlbBase64(glbBase64({
      asset: { version: "2.0" },
      nodes: [{ name: "root" }, { name: "Monster_LOD2" }, { name: "Aurion_Humanoid_Rig" }],
      meshes: [{ name: "monster_mesh", primitives: [] }],
      skins: [{ name: "Aurion_Humanoid_Rig", joints: [0] }],
      animations: animationNames(["Attack", "Death", "Idle", "Walk"]),
    }));
    expect(result).toMatchObject({ assetType: "enemy", subcategory: "rigged-monster-lod2", lod: 2 });
  });

  it("classifies explicit static equipment and world assets conservatively", () => {
    expect(classifyGlbBase64(glbBase64({ asset: { version: "2.0" }, nodes: [{ name: "Sunward_Spear_Weapon" }], meshes: [{ name: "Spear_Blade" }] })).assetType).toBe("weapon");
    expect(classifyGlbBase64(glbBase64({ asset: { version: "2.0" }, nodes: [{ name: "Warden_Chestplate_Armor" }], meshes: [{ name: "Armor_Mesh" }] })).assetType).toBe("armor");
    expect(classifyGlbBase64(glbBase64({ asset: { version: "2.0" }, nodes: [{ name: "Asterion_Courtyard_Arena" }], meshes: [{ name: "Terrain" }] })).assetType).toBe("arena");
  });

  it("fails closed when a GLB cannot be classified safely", () => {
    expect(() => classifyGlbBase64(glbBase64({ asset: { version: "2.0" }, nodes: [{ name: "Cube" }], meshes: [{ name: "Mesh" }] }))).toThrow("could not be classified safely");
  });
});
