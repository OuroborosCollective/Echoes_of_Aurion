export const AURION_VILLAGE_FOUNTAIN_CONTRACT_VERSION = "aurion.village-fountain.v1" as const;

export const AURION_VILLAGE_FOUNTAIN_DISPLAY_NAME = "Aurion Village Fountain" as const;
export const AURION_VILLAGE_FOUNTAIN_PURPOSE = "world-environment" as const;
export const AURION_VILLAGE_FOUNTAIN_SUBCATEGORY = "fountain" as const;

/**
 * Presentation-only placement inside the starter plaza.
 * The diagonal offset keeps the canonical Return Stone at 0/0 and all
 * cardinal road axes unobstructed. No collision/gameplay authority is implied.
 */
export const AURION_VILLAGE_FOUNTAIN_POSITION = Object.freeze({
  x: 12_000,
  z: 12_000,
} as const);

export const AURION_VILLAGE_FOUNTAIN_LODS = Object.freeze([
  Object.freeze({
    level: 1 as const,
    fileName: "Aurion_Village_Fountain_LOD1.glb",
    sha256: "68b4b573d41589ed82632b3915280c41858d237d3d18f0b37763f677f26c20db",
    assetId: "glb_68b4b573d41589ed82632b3915280c41858d237d3d18f0b3",
    bytes: 720_480,
    textureSize: 1024,
    triangles: 2_132,
  }),
  Object.freeze({
    level: 2 as const,
    fileName: "Aurion_Village_Fountain_LOD2.glb",
    sha256: "1aa07c92677889a6173df083f6eb025d4a02c942ab8f7bd89f286882db23c90a",
    assetId: "glb_1aa07c92677889a6173df083f6eb025d4a02c942ab8f7bd8",
    bytes: 204_956,
    textureSize: 512,
    triangles: 1_053,
  }),
] as const);

export const AURION_VILLAGE_FOUNTAIN_PRIMARY = AURION_VILLAGE_FOUNTAIN_LODS[0];
