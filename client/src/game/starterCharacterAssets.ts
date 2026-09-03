import { validateRuntimeModelSource } from "@shared/runtimeContracts";

export type StarterRuntimeAssetSource = Readonly<{
  assetId: string;
  storageUrl: string;
}>;

export type StarterRuntimeAssetSources = Readonly<{
  player: StarterRuntimeAssetSource | null;
  spider: StarterRuntimeAssetSource | null;
  beastLods: readonly [
    StarterRuntimeAssetSource | null,
    StarterRuntimeAssetSource | null,
    StarterRuntimeAssetSource | null,
    StarterRuntimeAssetSource | null,
  ];
}>;

export const STARTER_CHARACTER_ASSETS = Object.freeze({
  player: Object.freeze({
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
    animations: Object.freeze(["Idle", "Walk", "Attack", "Death"] as const),
  }),
  beast: Object.freeze({
    lods: Object.freeze([
      Object.freeze({ triangleCount: 1149 }),
      Object.freeze({ triangleCount: 694 }),
      Object.freeze({ triangleCount: 345 }),
      Object.freeze({ triangleCount: 145 }),
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

function normalizeSource(value: unknown): StarterRuntimeAssetSource | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { assetId?: unknown; storageUrl?: unknown };
  if (typeof candidate.assetId !== "string" || candidate.assetId.length < 8) return null;
  if (typeof candidate.storageUrl !== "string" || !validateRuntimeModelSource(candidate.storageUrl).valid) return null;
  return Object.freeze({ assetId: candidate.assetId, storageUrl: candidate.storageUrl });
}

export function normalizeStarterRuntimeAssetSources(value: unknown): StarterRuntimeAssetSources {
  const candidate = value && typeof value === "object" ? value as { player?: unknown; spider?: unknown; beastLods?: unknown } : {};
  const rawLods = Array.isArray(candidate.beastLods) ? candidate.beastLods : [];
  return Object.freeze({
    player: normalizeSource(candidate.player),
    spider: normalizeSource(candidate.spider),
    beastLods: Object.freeze([
      normalizeSource(rawLods[0]),
      normalizeSource(rawLods[1]),
      normalizeSource(rawLods[2]),
      normalizeSource(rawLods[3]),
    ]) as StarterRuntimeAssetSources["beastLods"],
  });
}
