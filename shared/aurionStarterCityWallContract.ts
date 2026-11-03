/** Owner-supplied SKP city wall, with embedded PBR textures. Presentation only;
 * gameplay collision remains owned by Aurion, never by imported geometry. */
export const AURION_STARTER_CITY_WALL_VERSION = "aurion.starter-city-wall.v1" as const;
export const AURION_STARTER_CITY_WALL_ENVELOPE_MM = [110_000, 20_000, 110_000] as const;
export const AURION_STARTER_CITY_WALL_SOURCE_SKP_SHA256 = "c0deb741c04422d90bf74b7a5ae86fb3d51b46da72947a3f67620097c1bd56bf";
export const AURION_STARTER_CITY_WALL_LODS = Object.freeze([
  { level: 0, fileName: "Aurion_CityWall_LOD0.glb", sha256: "a6c164035b8c8f1855ccf52e38c3202731718acc28346cc07f4837591540f349", bytes: 9_299_064, triangles: 19_012 },
  { level: 1, fileName: "Aurion_CityWall_LOD1.glb", sha256: "003420006a5e06fffe46f22e2d4e915b2fc45f752a5a09e75094de9e3e9f6f9d", bytes: 8_421_884, triangles: 13_170 },
  { level: 2, fileName: "Aurion_CityWall_LOD2.glb", sha256: "1dab1c81a3c73d1970bbc2a68cc61f20452d4fda0384269dde0987ff04108a1d", bytes: 7_921_780, triangles: 9_836 },
] as const);

/** An arbitrary model named CityWall must not gain the large visual envelope. */
export function isStarterCityWallSource(sha256: string): boolean {
  return AURION_STARTER_CITY_WALL_LODS.some(lod => lod.sha256 === sha256);
}

export function starterCityWallAssetId(sha256: string): string {
  if (!isStarterCityWallSource(sha256)) throw new Error("STARTER_CITY_WALL_SOURCE_UNKNOWN");
  return `glb_${sha256.slice(0, 48)}`;
}
