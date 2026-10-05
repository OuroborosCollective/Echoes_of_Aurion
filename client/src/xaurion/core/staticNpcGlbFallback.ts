/**
 * Static NPC GLB Fallback — Aurion-native.
 *
 * When the runtime GLB catalog (from the database) has no approved NPC
 * fallback entries, NPCs would otherwise remain as invisible or geometric
 * primitive shapes (cylinders/spheres). This module provides a deterministic
 * static fallback pool derived from the revision-locked Wasd GLB catalog's
 * character models, ensuring every NPC automatically gets a proper 3D model.
 *
 * Selection is presentation-only and deterministic: it uses the same FNV-1a
 * identity hash as the catalog fallback, so the same NPC always gets the same
 * model across sessions.
 */

import { wasdGlbCatalog, type WasdGlbAsset } from "../../lib/wasdGlbCatalog";

/** A lightweight model reference sufficient for GLB loading. */
export type StaticNpcGlbSelection = Readonly<{
  assetId: string;
  sha256: string;
  storageUrl: string;
  displayName: string;
  source: "static-fallback";
}>;

/**
 * The static fallback pool: all streamable character models from the Wasd
 * GLB catalog. These are small, proven models suitable for NPC presentation.
 */
const staticCharacterPool: readonly WasdGlbAsset[] = Object.freeze(
  wasdGlbCatalog
    .filter(
      (asset) =>
        asset.role === "character" &&
        asset.budgetStatus === "streamable" &&
        asset.sourceUrl.length > 0,
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id)),
);

/**
 * FNV-1a hash — identical to npcVisualIdentityHash in NpcGlbFallback.ts.
 * Kept in sync so the static fallback uses the same deterministic selection.
 */
function fnv1aHash(identity: string): number {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministically select a static character model for an NPC identity.
 * Returns null if the pool is empty.
 *
 * The same NPC identity always maps to the same model, ensuring visual
 * consistency across sessions without any server-side assignment.
 */
export function selectStaticNpcGlb(npcIdentity: string): StaticNpcGlbSelection | null {
  if (!npcIdentity || staticCharacterPool.length === 0) return null;
  const index = fnv1aHash(npcIdentity) % staticCharacterPool.length;
  const asset = staticCharacterPool[index]!;
  return Object.freeze({
    assetId: asset.id,
    sha256: asset.sha256,
    storageUrl: asset.sourceUrl,
    displayName: asset.sourcePath.split("/").pop() ?? asset.id,
    source: "static-fallback" as const,
  });
}

/** Whether the static fallback pool has any available models. */
export function hasStaticNpcFallbackPool(): boolean {
  return staticCharacterPool.length > 0;
}

/** Number of models in the static fallback pool. */
export function staticNpcFallbackPoolSize(): number {
  return staticCharacterPool.length;
}
