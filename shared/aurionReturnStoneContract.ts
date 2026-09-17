export const AURION_RETURN_STONE_CONTRACT_VERSION = "aurion.return-stone.v1" as const;

/**
 * Immutable owner-supplied GLB selected for the Aurion return-stone presentation.
 * This SHA grants visual identity only. It never grants revive, travel, discovery,
 * collision, quest or world-state authority.
 */
export const AURION_RETURN_STONE_SOURCE_SHA256 =
  "dec4033e1f19e0d79c0d7494de3a3d4f5aeb4c3f4e422529df2721e13deb27cf" as const;

export const AURION_RETURN_STONE_ASSET_ID =
  `glb_${AURION_RETURN_STONE_SOURCE_SHA256.slice(0, 48)}` as const;

export const AURION_RETURN_STONE_LIVE_ZONE = "observatory_threshold" as const;
export const AURION_RETURN_STONE_POI_ID = "return-stone" as const;

/** Fixed-point millimetres used by the authoritative zone runtime. */
export const AURION_RETURN_STONE_POSITION = Object.freeze({ x: 0, z: 0 });

/** Presentation target only; the renderer may scale the immutable GLB to this size. */
export const AURION_RETURN_STONE_TARGET_SIZE_METERS = 3.2;

/** Existing semantic return-stone POIs in open-world content. Coordinates for the
 * non-live zones are intentionally not invented here; cross-zone travel must wait
 * for server-confirmed zone/POI discovery and hand-off evidence. */
export const AURION_RETURN_STONE_POI_IDS = Object.freeze([
  "return-stone",
  "windhollow-return",
  "emberfall-return",
  "vault-return",
  "starfall-return",
] as const);
