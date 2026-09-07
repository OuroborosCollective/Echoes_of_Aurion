import { NPC_FALLBACK_DISPLAY_PREFIX, type GlbRuntimeCatalog } from "@shared/glbImportContract";

export type NpcGlbCatalogEntry = GlbRuntimeCatalog["entries"][number];
export type NpcGlbSelection = Readonly<{
  entry: NpcGlbCatalogEntry;
  source: "assigned" | "fallback";
  fallbackIndex: number | null;
}>;

/**
 * Presentation-only FNV-1a selector. It intentionally consumes only a stable
 * NPC identity and a sorted approved fallback pool: no clock, randomness,
 * mutable gameplay state or player identity can influence the visual choice.
 */
export function npcVisualIdentityHash(identity: string): number {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function isNpcFallbackCatalogEntry(entry: NpcGlbCatalogEntry): boolean {
  return entry.assetType === "character"
    && entry.targetKey === null
    && entry.displayName.startsWith(NPC_FALLBACK_DISPLAY_PREFIX);
}

export function npcFallbackPool(catalog: GlbRuntimeCatalog | null | undefined): NpcGlbCatalogEntry[] {
  if (!catalog) return [];
  return catalog.entries
    .filter(isNpcFallbackCatalogEntry)
    .slice()
    .sort((left, right) => left.sha256.localeCompare(right.sha256) || left.assetId.localeCompare(right.assetId));
}

export function selectNpcGlb(
  catalog: GlbRuntimeCatalog | null | undefined,
  npcIdentity: string,
  preferredTargetKey?: string | null,
): NpcGlbSelection | null {
  if (!catalog || !npcIdentity) return null;
  if (preferredTargetKey) {
    const assigned = catalog.entries.find(entry => entry.assetType === "character" && entry.targetKey === preferredTargetKey);
    if (assigned) return Object.freeze({ entry: assigned, source: "assigned", fallbackIndex: null });
  }
  const pool = npcFallbackPool(catalog);
  if (!pool.length) return null;
  const fallbackIndex = npcVisualIdentityHash(npcIdentity) % pool.length;
  return Object.freeze({ entry: pool[fallbackIndex]!, source: "fallback", fallbackIndex });
}
