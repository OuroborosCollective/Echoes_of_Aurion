export const ASTERION_COURTYARD_CONTRACT_VERSION = "aurion.asterion-courtyard.v1" as const;
export const ASTERION_COURTYARD_TARGET_KEY = "asterion_courtyard" as const;
export const ASTERION_COURTYARD_DISPLAY_NAME = "Asterion Courtyard" as const;

export const ASTERION_COURTYARD_LODS = Object.freeze([
  Object.freeze({
    level: 0 as const,
    fileName: "Asterion_Courtyard_LOD0.glb",
    sha256: "dc4199201ce72b403d63570e8112b28cb037938fdbadc68d47c8782d0f952e2d",
    assetId: "glb_dc4199201ce72b403d63570e8112b28cb037938fdbadc68d",
    bytes: 687_260,
    triangles: 3_735,
    textureSize: 1024,
  }),
  Object.freeze({
    level: 1 as const,
    fileName: "Asterion_Courtyard_LOD1.glb",
    sha256: "b02c76c803de5facee861042965ef534ab3efade3b3cec5f359f1e82d692cb65",
    assetId: "glb_b02c76c803de5facee861042965ef534ab3efade3b3cec5f",
    bytes: 646_756,
    triangles: 2_781,
    textureSize: 1024,
  }),
  Object.freeze({
    level: 2 as const,
    fileName: "Asterion_Courtyard_LOD2.glb",
    sha256: "a8d05c60d38f34adccb06bb9606fd70700f6ce198d07cf8716f8390c02b16775",
    assetId: "glb_a8d05c60d38f34adccb06bb9606fd70700f6ce198d07cf87",
    bytes: 238_252,
    triangles: 1_818,
    textureSize: 512,
  }),
] as const);

export const ASTERION_COURTYARD_PRIMARY = ASTERION_COURTYARD_LODS[0];
