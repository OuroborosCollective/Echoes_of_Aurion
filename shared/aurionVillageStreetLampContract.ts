export const AURION_VILLAGE_STREET_LAMP_CONTRACT_VERSION = "aurion.village-street-lamp.v1" as const;

export const AURION_VILLAGE_STREET_LAMP_DISPLAY_NAME = "Aurion Village Street Lamp" as const;
export const AURION_VILLAGE_STREET_LAMP_PURPOSE = "world-environment" as const;
export const AURION_VILLAGE_STREET_LAMP_SUBCATEGORY = "street-prop" as const;

/**
 * Presentation-only placements just outside the 10 m starter-village radial roads.
 * The 6 m lateral offset preserves the 5 m road half-width plus a 1 m visual margin.
 * No collision, interaction, quest, lighting or persistence authority is implied.
 */
export const AURION_VILLAGE_STREET_LAMP_PLACEMENTS = Object.freeze([
  Object.freeze({ key: "north-inner", x: -6_000, z: 30_000, rotationQuarterTurns: 0 as const }),
  Object.freeze({ key: "north-outer", x: 6_000, z: 60_000, rotationQuarterTurns: 2 as const }),
  Object.freeze({ key: "east-inner", x: 30_000, z: 6_000, rotationQuarterTurns: 1 as const }),
  Object.freeze({ key: "east-outer", x: 60_000, z: -6_000, rotationQuarterTurns: 3 as const }),
  Object.freeze({ key: "south-inner", x: 6_000, z: -30_000, rotationQuarterTurns: 2 as const }),
  Object.freeze({ key: "south-outer", x: -6_000, z: -60_000, rotationQuarterTurns: 0 as const }),
  Object.freeze({ key: "west-inner", x: -30_000, z: -6_000, rotationQuarterTurns: 3 as const }),
  Object.freeze({ key: "west-outer", x: -60_000, z: 6_000, rotationQuarterTurns: 1 as const }),
] as const);

export const AURION_VILLAGE_STREET_LAMP_LODS = Object.freeze([
  Object.freeze({
    level: 0 as const,
    fileName: "Aurion_Street_Lamp_LOD0.glb",
    sha256: "8246a3c42834d9280cbad0cd89b6e354650857223590e7177b696a26cb6cd2ec",
    assetId: "glb_8246a3c42834d9280cbad0cd89b6e354650857223590e717",
    bytes: 2_514_256,
    textureSize: 1024,
    triangles: 4_172,
  }),
  Object.freeze({
    level: 1 as const,
    fileName: "Aurion_Street_Lamp_LOD1.glb",
    sha256: "c6655649ba9ca1ef602371a08552ffd70cda8b35a0bc796f21bdcc98bbeaca42",
    assetId: "glb_c6655649ba9ca1ef602371a08552ffd70cda8b35a0bc796f",
    bytes: 2_484_916,
    textureSize: 1024,
    triangles: 3_128,
  }),
  Object.freeze({
    level: 2 as const,
    fileName: "Aurion_Street_Lamp_LOD2.glb",
    sha256: "61da6c957f63f9c994f6b657d813a165f6ec73f2e9680cb1406ac33557f212c8",
    assetId: "glb_61da6c957f63f9c994f6b657d813a165f6ec73f2e9680cb1",
    bytes: 785_232,
    textureSize: 512,
    triangles: 2_086,
  }),
  Object.freeze({
    level: 3 as const,
    fileName: "Aurion_Street_Lamp_LOD3.glb",
    sha256: "9297ed693e9b6e693ceb90f0776872f24291ef0ee7505ffd007620c68d049e61",
    assetId: "glb_9297ed693e9b6e693ceb90f0776872f24291ef0ee7505ffd",
    bytes: 259_136,
    textureSize: 256,
    triangles: 1_042,
  }),
] as const);

export const AURION_VILLAGE_STREET_LAMP_PRIMARY = AURION_VILLAGE_STREET_LAMP_LODS[0];
