import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { shippedPlacementIdOf, type WorldVisualOverrideReadback } from "../shared/worldVisualOverrideContract";

/**
 * Procedural placements of the shipped world plan that an administrator removed or
 * replaced (persisted world visual overrides with a `shipped:<placementId>` reference).
 *
 * Aurion stops planning them: the region read omits them and movement collision no
 * longer contains their hull. A replacement is drawn by the clients as an uploaded
 * world visual at the same spot and, like every uploaded visual, has no collider.
 *
 * This is a derived in-process index of the persisted override heads. The database
 * stays the only truth; the index is rebuilt from every confirmed readback of the
 * global world and updated by the committed write itself.
 */
let hidden: ReadonlySet<string> = new Set();
let fingerprint = "";
let loaded = false;
const listeners = new Set<() => void>();

const fingerprintOf = (ids: ReadonlySet<string>) => [...ids].sort().join("\n");

function replace(next: ReadonlySet<string>): void {
  loaded = true;
  const nextFingerprint = fingerprintOf(next);
  if (nextFingerprint === fingerprint) return;
  hidden = next;
  fingerprint = nextFingerprint;
  for (const listener of listeners) listener();
}

/** Placement ids the readback hides (removed or replaced procedural placements). */
export function hiddenShippedPlacementIds(readback: Pick<WorldVisualOverrideReadback, "overrides">): Set<string> {
  const ids = new Set<string>();
  for (const override of readback.overrides) {
    const placementId = shippedPlacementIdOf(override.placementRef);
    if (placementId !== null) ids.add(placementId);
  }
  return ids;
}

/** Rebuild the index from a confirmed readback. Readbacks of other worlds are ignored. */
export function applyShippedPlacementReadback(readback: Pick<WorldVisualOverrideReadback, "overrides" | "worldId">): void {
  if (readback.worldId !== GLOBAL_WORLD_ID) return;
  replace(hiddenShippedPlacementIds(readback));
}

/** Apply one committed override write of the global world (assetId null restores). */
export function applyShippedPlacementWrite(worldId: string, placementRef: string, assetId: string | null): void {
  const placementId = shippedPlacementIdOf(placementRef);
  if (worldId !== GLOBAL_WORLD_ID || placementId === null || !loaded) return;
  if ((assetId !== null) === hidden.has(placementId)) return;
  const next = new Set(hidden);
  if (assetId !== null) next.add(placementId); else next.delete(placementId);
  replace(next);
}

/** Without a database there are no persisted overrides: the shipped plan is complete. */
export function markShippedPlacementOverridesEmpty(): void { replace(new Set()); }

export const shippedPlacementOverridesLoaded = () => loaded;
export const isShippedPlacementHidden = (placementId: string) => hidden.has(placementId);
export const hiddenShippedPlacementCount = () => hidden.size;

/** Derived caches (movement collision) drop their state when the index changes. */
export function onShippedPlacementOverridesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: back to the unloaded, empty state. */
export function resetShippedPlacementOverridesForTest(): void {
  loaded = false;
  if (!hidden.size) { fingerprint = ""; return; }
  hidden = new Set();
  fingerprint = "";
  for (const listener of listeners) listener();
}
