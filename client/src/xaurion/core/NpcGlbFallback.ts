import { NPC_FALLBACK_DISPLAY_PREFIX, type GlbRuntimeCatalog } from "@shared/glbImportContract";

export type NpcGlbCatalogEntry = GlbRuntimeCatalog["entries"][number];
export type NpcGlbSelection = Readonly<{
  entry: NpcGlbCatalogEntry;
  source: "assigned" | "fallback";
  fallbackIndex: number | null;
  variantKey: string | null;
  lod: number | null;
}>;

type NpcFallbackVariant = Readonly<{ key: string; entries: readonly Readonly<{ entry: NpcGlbCatalogEntry; lod: number | null }>[] }>;

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

export function npcFallbackDescriptor(entry: NpcGlbCatalogEntry): Readonly<{ variantKey: string; lod: number | null }> {
  const raw = entry.displayName.slice(NPC_FALLBACK_DISPLAY_PREFIX.length).trim();
  const lodMatch = raw.match(/(?:^|\s)LOD\s*([0-9]+)(?=\s|$)/i);
  const lod = lodMatch ? Number.parseInt(lodMatch[1]!, 10) : null;
  const variantKey = raw
    .replace(/(?:^|\s)LOD\s*[0-9]+(?=\s|$)/ig, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return Object.freeze({ variantKey: variantKey || raw.toLowerCase(), lod });
}

export function npcFallbackVariants(catalog: GlbRuntimeCatalog | null | undefined): readonly NpcFallbackVariant[] {
  const grouped = new Map<string, Array<{ entry: NpcGlbCatalogEntry; lod: number | null }>>();
  for (const entry of npcFallbackPool(catalog)) {
    const descriptor = npcFallbackDescriptor(entry);
    const current = grouped.get(descriptor.variantKey) ?? [];
    current.push({ entry, lod: descriptor.lod });
    grouped.set(descriptor.variantKey, current);
  }
  return Object.freeze([...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entries]) => Object.freeze({
      key,
      entries: Object.freeze(entries.slice().sort((left, right) => (left.lod ?? Number.MAX_SAFE_INTEGER) - (right.lod ?? Number.MAX_SAFE_INTEGER) || left.entry.sha256.localeCompare(right.entry.sha256))),
    })));
}

export function selectNpcGlb(
  catalog: GlbRuntimeCatalog | null | undefined,
  npcIdentity: string,
  preferredTargetKey?: string | null,
  preferredLod: number | null = null,
): NpcGlbSelection | null {
  if (!catalog || !npcIdentity) return null;
  if (preferredTargetKey) {
    const assigned = catalog.entries.find(entry => entry.assetType === "character" && entry.targetKey === preferredTargetKey);
    if (assigned) {
      const descriptor = assigned.displayName.startsWith(NPC_FALLBACK_DISPLAY_PREFIX) ? npcFallbackDescriptor(assigned) : { variantKey: null, lod: null };
      return Object.freeze({ entry: assigned, source: "assigned", fallbackIndex: null, variantKey: descriptor.variantKey, lod: descriptor.lod });
    }
  }
  const variants = npcFallbackVariants(catalog);
  if (!variants.length) return null;
  const fallbackIndex = npcVisualIdentityHash(npcIdentity) % variants.length;
  const variant = variants[fallbackIndex]!;
  const preferred = preferredLod === null ? undefined : variant.entries.find(candidate => candidate.lod === preferredLod);
  const candidate = preferred ?? variant.entries.find(candidate => candidate.lod === 0) ?? variant.entries.find(candidate => candidate.lod === 1) ?? variant.entries[0]!;
  return Object.freeze({ entry: candidate.entry, source: "fallback", fallbackIndex, variantKey: variant.key, lod: candidate.lod });
}
