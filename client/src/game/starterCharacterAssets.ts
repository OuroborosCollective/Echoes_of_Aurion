import { STARTER_GLB_BUILD_ASSETS, type StarterGlbBuildAsset } from "@shared/starterGlbAssetManifest";

export type ChunkedGlbAsset = Pick<StarterGlbBuildAsset,
  "id" | "compressedBytes" | "glbBytes" | "compressedSha256" | "glbSha256"
> & Readonly<{ parts: readonly string[] }>;

function runtimeAsset(asset: StarterGlbBuildAsset): ChunkedGlbAsset {
  return Object.freeze({
    id: asset.id,
    parts: Object.freeze([asset.publicUrl]),
    compressedBytes: asset.compressedBytes,
    glbBytes: asset.glbBytes,
    compressedSha256: asset.compressedSha256,
    glbSha256: asset.glbSha256,
  });
}

export const STARTER_CHARACTER_ASSETS = Object.freeze({
  player: Object.freeze({
    ...runtimeAsset(STARTER_GLB_BUILD_ASSETS.player),
    animations: Object.freeze(["AttackCombo", "Death", "Fight", "Idle", "Jump", "Run", "Walk"] as const),
    equipmentSockets: Object.freeze([
      "Socket_Head",
      "Socket_Chest",
      "Socket_Shoulder_L",
      "Socket_Shoulder_R",
      "Socket_Hand_L",
      "Socket_Hand_R",
      "Socket_Leg_L",
      "Socket_Leg_R",
      "Socket_Foot_L",
      "Socket_Foot_R",
      "Socket_Weapon_L",
      "Socket_Weapon_R",
      "Socket_Weapon_Hip",
      "Socket_Weapon_Back",
    ] as const),
  }),
  spider: Object.freeze({
    ...runtimeAsset(STARTER_GLB_BUILD_ASSETS.spider),
    animations: Object.freeze(["Idle", "Walk", "Attack", "Death"] as const),
  }),
  beast: Object.freeze({
    id: "starter_beast",
    lods: Object.freeze([
      Object.freeze({ ...runtimeAsset(STARTER_GLB_BUILD_ASSETS.beastLod0), triangleCount: 1149 }),
      Object.freeze({ ...runtimeAsset(STARTER_GLB_BUILD_ASSETS.beastLod1), triangleCount: 694 }),
      Object.freeze({ ...runtimeAsset(STARTER_GLB_BUILD_ASSETS.beastLod2), triangleCount: 345 }),
      Object.freeze({ ...runtimeAsset(STARTER_GLB_BUILD_ASSETS.beastLod3), triangleCount: 145 }),
    ] as const),
    animations: Object.freeze(["Idle", "Walk", "Attack", "Death"] as const),
  }),
});

export type StarterCreatureKind = "spider" | "beast" | "procedural";

export const STARTER_MONSTER_LOD_THRESHOLDS_METERS = Object.freeze([10, 25, 50] as const);
export const STARTER_MONSTER_LOD_HYSTERESIS = 0.10;

export function starterCreatureKindForArena(arenaIndex: number): StarterCreatureKind {
  if (arenaIndex === 0) return "spider";
  if (arenaIndex === 1) return "beast";
  return "procedural";
}

export function selectStarterMonsterLod(distanceMeters: number, currentLod = 0): 0 | 1 | 2 | 3 {
  const distance = Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters) : 0;
  let lod = Math.max(0, Math.min(3, Math.trunc(currentLod))) as 0 | 1 | 2 | 3;

  while (lod < 3) {
    const thresholdIndex = Math.min(lod, 2) as 0 | 1 | 2;
    const threshold = STARTER_MONSTER_LOD_THRESHOLDS_METERS[thresholdIndex];
    if (distance + Number.EPSILON * 128 < threshold * (1 + STARTER_MONSTER_LOD_HYSTERESIS)) break;
    lod = (lod + 1) as 0 | 1 | 2 | 3;
  }
  while (lod > 0) {
    const thresholdIndex = Math.max(0, lod - 1) as 0 | 1 | 2;
    const threshold = STARTER_MONSTER_LOD_THRESHOLDS_METERS[thresholdIndex];
    if (distance >= threshold * (1 - STARTER_MONSTER_LOD_HYSTERESIS)) break;
    lod = (lod - 1) as 0 | 1 | 2 | 3;
  }
  return lod;
}
