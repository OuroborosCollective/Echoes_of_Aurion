import { getDb } from "./db";
import { readWorldVisualOverrides } from "./worldVisualOverridePersistence";
import {
  isShippedPlacementHidden,
  markShippedPlacementOverridesEmpty,
  shippedPlacementOverridesLoaded,
} from "./worldShippedPlacementOverrides";
import { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } from "../shared/worldIdentity";
import { legacyWorldAssetRegion, worldAssetRegion, type WorldAssetRegion } from "../shared/worldAssetProtocol";
import type { WorldChunkCoordinate } from "../shared/worldChunkProtocol";

let loading: Promise<void> | null = null;

/**
 * Load the persisted admin removals/replacements of procedural placements once.
 * Without a configured database nothing can be persisted, so the plan is complete.
 * A configured but failing database fails the read: the world is never served with
 * placements the admin removed.
 */
export function ensureShippedPlacementOverridesLoaded(): Promise<void> {
  if (shippedPlacementOverridesLoaded()) return Promise.resolve();
  loading ??= (async () => {
    if (!(await getDb())) { markShippedPlacementOverridesEmpty(); return; }
    await readWorldVisualOverrides(GLOBAL_WORLD_ID);
  })().finally(() => { loading = null; });
  return loading;
}

const visible = <T extends { id: string }>(placements: readonly T[]): T[] => placements.filter(placement => !isShippedPlacementHidden(placement.id));

/**
 * The world plan every client renders: the deterministic Aurion placement plan minus
 * the procedural placements an administrator removed or replaced. Movement collision
 * (`worldNatureCollision`) applies the same index, so plan and collision agree.
 */
export async function confirmedWorldAssetRegion(center: WorldChunkCoordinate): Promise<WorldAssetRegion> {
  await ensureShippedPlacementOverridesLoaded();
  const region = worldAssetRegion(GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED, center);
  return { ...region, placements: visible(region.placements) };
}

export async function confirmedLegacyWorldAssetRegion(center: WorldChunkCoordinate) {
  await ensureShippedPlacementOverridesLoaded();
  const region = legacyWorldAssetRegion(GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED, center);
  return { ...region, placements: visible(region.placements) };
}
