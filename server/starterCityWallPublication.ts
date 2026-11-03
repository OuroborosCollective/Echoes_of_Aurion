import { WorldDesignReadbackSchema, type WorldDesignDraft, type WorldDesignReadback } from "../shared/aurionAuthoringContract";
import { AURION_STARTER_CITY_WALL_LODS, starterCityWallAssetId } from "../shared/aurionStarterCityWallContract";
import type { GlbImportStore } from "./glbImportStore";

/** The public asset route uses this same approval, storage-root and digest check. */
export async function requireStarterCityWallStoredAssets(store: Pick<GlbImportStore, "approvedBytes">) {
  const stored = [];
  for (const lod of AURION_STARTER_CITY_WALL_LODS) {
    const bytes = await store.approvedBytes(lod.sha256);
    if (!bytes) throw new Error("CITY_WALL_STORED_GLB_UNAVAILABLE");
    if (bytes.length !== lod.bytes) throw new Error("CITY_WALL_STORED_GLB_SIZE_MISMATCH");
    stored.push({ level: lod.level, sha256: lod.sha256, bytes: bytes.length });
  }
  return stored;
}

export const STARTER_CITY_WALL_PLACEMENT = Object.freeze({
  placementKey: "city-perimeter",
  assetId: starterCityWallAssetId(AURION_STARTER_CITY_WALL_LODS[0].sha256),
  chunkX: 0, chunkZ: 0, xMm: 32000, zMm: 32000,
  rotationQuarterTurns: 0 as const, scalePermille: 1000,
});

export function requireStarterCityWallPlacement(design: Pick<WorldDesignDraft, "designKey" | "version" | "placements">): void {
  const placement = design.placements[0];
  if (design.designKey !== "starter-city-wall" || design.version !== 1 || design.placements.length !== 1
    || !placement || Object.entries(STARTER_CITY_WALL_PLACEMENT).some(([key, value]) => placement[key as keyof typeof placement] !== value)) {
    throw new Error("CITY_WALL_DESIGN_READBACK_MISMATCH");
  }
}

/** Catalog presence alone is never proof that the wall was published. */
export function requireStarterCityWallReadback(value: unknown): WorldDesignReadback["designs"][number] {
  const world = WorldDesignReadbackSchema.parse(value);
  const matches = world.designs.filter(design => design.designKey === "starter-city-wall");
  if (matches.length !== 1) throw new Error("CITY_WALL_DESIGN_READBACK_MISSING_OR_AMBIGUOUS");
  requireStarterCityWallPlacement(matches[0]!);
  return matches[0]!;
}
