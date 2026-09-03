export type ChunkedGlbAsset = Readonly<{
  id: string;
  parts: readonly string[];
  compressedBytes: number;
  glbBytes: number;
  compressedSha256: string;
  glbSha256: string;
}>;

export const STARTER_CHARACTER_ASSETS = Object.freeze({
  player: Object.freeze({
    id: "aurion_humanoid_v1",
    parts: Object.freeze([
      "/game-assets/characters/aurion_humanoid_v1.glb.gz.part00",
      "/game-assets/characters/aurion_humanoid_v1.glb.gz.part01",
    ] as const),
    compressedBytes: 173424,
    glbBytes: 495220,
    compressedSha256: "fc353c0c83cba981899263c22b35aa1292bd95a0547c79b6f881e55825c4fa1d",
    glbSha256: "970f0aab7cb458819d56e3c7d06631221ae14dedbdc72a8a15f0d3552ed98838",
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
    id: "starter_spider",
    parts: Object.freeze(Array.from({ length: 13 }, (_, index) => `/game-assets/monsters/spider.glb.gz.part${String(index).padStart(2, "0")}`)),
    compressedBytes: 1253550,
    glbBytes: 1802924,
    compressedSha256: "39a6bd3bb3c5ec5a071c8a8f13ae3dcb3687d118f1726d85d352de9fca396119",
    glbSha256: "8ab214f338668c5d7e48f647ee7d990773017096d73a1b4801e9f41403469199",
    animations: Object.freeze(["Idle", "Walk", "Attack", "Death"] as const),
  }),
  beast: Object.freeze({
    id: "starter_beast",
    lods: Object.freeze([
      Object.freeze({
        id: "starter_beast_lod0",
        parts: Object.freeze(["/game-assets/monsters/starter_beast_lod0.glb.gz.part00", "/game-assets/monsters/starter_beast_lod0.glb.gz.part01"] as const),
        compressedBytes: 129549,
        glbBytes: 318644,
        compressedSha256: "415b4a21bba87ff600affa6323afa6f276469d161a235ab15aab0e2821cfdcca",
        glbSha256: "9098463166e2b8a3ec241eef5f0e3953e268584b0f9d1376f3f7c0e0e77df824",
        triangleCount: 1149,
      }),
      Object.freeze({
        id: "starter_beast_lod1",
        parts: Object.freeze(["/game-assets/monsters/starter_beast_lod1.glb.gz.part00", "/game-assets/monsters/starter_beast_lod1.glb.gz.part01"] as const),
        compressedBytes: 114467,
        glbBytes: 244928,
        compressedSha256: "e2cf3c8678710f0a036cff864958b9b3e2e454889bbc8801052b8a9ed382bd91",
        glbSha256: "31cbb7e3156230136f640e00d557fb4df701d358a9a2cc463654d08c95aafe30",
        triangleCount: 694,
      }),
      Object.freeze({
        id: "starter_beast_lod2",
        parts: Object.freeze(["/game-assets/monsters/starter_beast_lod2.glb.gz.part00", "/game-assets/monsters/starter_beast_lod2.glb.gz.part01"] as const),
        compressedBytes: 101084,
        glbBytes: 188392,
        compressedSha256: "6d15d5facb121f4237d75c8b687f2dc68a8614440e16e3ad1d99001becdba0cf",
        glbSha256: "101c1727827b72be7bf3d82e1a9f1f9f1627051c9757148c33b368ed18a3cf74",
        triangleCount: 345,
      }),
      Object.freeze({
        id: "starter_beast_lod3",
        parts: Object.freeze(["/game-assets/monsters/starter_beast_lod3.glb.gz.part00"] as const),
        compressedBytes: 90260,
        glbBytes: 155768,
        compressedSha256: "8e9a6ce83d3db22251607bd527d318efbaa51cda54568b6cfd14ad1efe1e865e",
        glbSha256: "602a4d6e0c0fb2c0c50a2e9fa4ef937fd7f929ce07bc758bc4e607d27d5d89ef",
        triangleCount: 145,
      }),
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
