/** Owner-supplied SKP city wall, with embedded PBR textures. Presentation only;
 * gameplay collision remains owned by Aurion, never by imported geometry. */
export const AURION_STARTER_CITY_WALL_VERSION = "aurion.starter-city-wall.v1" as const;
export const AURION_STARTER_CITY_WALL_ENVELOPE_MM = [110_000, 20_000, 110_000] as const;
export const AURION_STARTER_CITY_WALL_SOURCE_SKP_SHA256 = "c0deb741c04422d90bf74b7a5ae86fb3d51b46da72947a3f67620097c1bd56bf";
// Measured from the same exact GLBs with the 8 m profile at base 5c788c7.
// Only these complete, independently hash-verified old manifests may migrate.
export const AURION_STARTER_CITY_WALL_LEGACY_NORMALIZATIONS = Object.freeze([
  "57c32c6137bdd64e41b44824215c93b416e7289a61fee02eea3f8207a4777390",
  "45f869d6a81cf3f35fc3ed62c4e24f4265051b6e8d770e3d1071670dfa82dc03",
  "9f878c892589534186f811c72fc4b33465b4bf4792c7a75496343ac61ca69835",
] as const);
// decodedBytes/textureBytes: `inspectGlbAllocation` of exactly these bytes (read back
// from the live asset store 2026-11-07). The browser reserves them as wall headroom.
export const AURION_STARTER_CITY_WALL_LODS = Object.freeze([
  { level: 0, fileName: "Aurion_CityWall_LOD0.glb", sha256: "a6c164035b8c8f1855ccf52e38c3202731718acc28346cc07f4837591540f349", bytes: 9_299_064, triangles: 19_012, decodedBytes: 38_029_584, textureBytes: 29_360_112 },
  { level: 1, fileName: "Aurion_CityWall_LOD1.glb", sha256: "003420006a5e06fffe46f22e2d4e915b2fc45f752a5a09e75094de9e3e9f6f9d", bytes: 8_421_884, triangles: 13_170, decodedBytes: 35_365_632, textureBytes: 29_360_112 },
  { level: 2, fileName: "Aurion_CityWall_LOD2.glb", sha256: "1dab1c81a3c73d1970bbc2a68cc61f20452d4fda0384269dde0987ff04108a1d", bytes: 7_921_780, triangles: 9_836, decodedBytes: 33_845_328, textureBytes: 29_360_112 },
] as const);

/** Pool key under which the browser reserves the wall's decoded/texture headroom. */
export const AURION_STARTER_CITY_WALL_HEADROOM_KEY = AURION_STARTER_CITY_WALL_VERSION;

/** Pinned decoded allocation of one wall LOD, or null for any other bytes. */
export function starterCityWallAllocation(sha256: string): { decodedBytes: number; textureBytes: number } | null {
  const lod = AURION_STARTER_CITY_WALL_LODS.find(item => item.sha256 === sha256);
  return lod ? { decodedBytes: lod.decodedBytes, textureBytes: lod.textureBytes } : null;
}

/** An arbitrary model named CityWall must not gain the large visual envelope. */
export function isStarterCityWallSource(sha256: string): boolean {
  return AURION_STARTER_CITY_WALL_LODS.some(lod => lod.sha256 === sha256);
}

export function starterCityWallAssetId(sha256: string): string {
  if (!isStarterCityWallSource(sha256)) throw new Error("STARTER_CITY_WALL_SOURCE_UNKNOWN");
  return `glb_${sha256.slice(0, 48)}`;
}
