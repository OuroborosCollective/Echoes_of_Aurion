import { glbCatalogLods, NPC_FALLBACK_DISPLAY_PREFIX, type GlbCatalogLodVariant, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { assetBudgets, type AssetTier } from "@shared/glbPresentationBudget";

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

/** Canonical presentation target for a named NPC. Gameplay identity remains the
 * existing server-owned npc id; this string only selects approved visual bytes. */
export function npcVisualTargetKey(npcIdentity: string): string {
  return `npc_${npcIdentity}`;
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

function physicalFamilyEntries(entry: NpcGlbCatalogEntry): readonly Readonly<{ entry: NpcGlbCatalogEntry; lod: number | null }>[] {
  if (!entry.lods?.length) return Object.freeze([{ entry, lod: npcFallbackDescriptor(entry).lod }]);
  return Object.freeze(entry.lods
    .slice()
    .sort((left, right) => left.level - right.level || left.sha256.localeCompare(right.sha256))
    .map(lod => Object.freeze({
      lod: lod.level,
      entry: Object.freeze({
        ...entry,
        assetId: lod.assetId,
        sha256: lod.sha256,
        bytes: lod.bytes,
        storageUrl: lod.storageUrl,
        targetKey: lod.targetKey,
        lods: [],
      }),
    })));
}

export function npcFallbackVariants(catalog: GlbRuntimeCatalog | null | undefined): readonly NpcFallbackVariant[] {
  const grouped = new Map<string, Array<{ entry: NpcGlbCatalogEntry; lod: number | null }>>();
  for (const entry of npcFallbackPool(catalog)) {
    const descriptor = npcFallbackDescriptor(entry);
    const current = grouped.get(descriptor.variantKey) ?? [];
    current.push(...physicalFamilyEntries(entry));
    grouped.set(descriptor.variantKey, current);
  }
  return Object.freeze([...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entries]) => Object.freeze({
      key,
      entries: Object.freeze(entries.slice().sort((left, right) => (left.lod ?? Number.MAX_SAFE_INTEGER) - (right.lod ?? Number.MAX_SAFE_INTEGER) || left.entry.sha256.localeCompare(right.entry.sha256))),
    })));
}

function catalogVariantFitsTier(candidate: GlbCatalogLodVariant, tier: AssetTier | null): boolean {
  return tier === null || candidate.bytes === null || candidate.bytes <= assetBudgets[tier].assetBytes;
}

function selectPhysicalVariant(
  entry: NpcGlbCatalogEntry,
  preferredLod: number | null,
  tier: AssetTier | null,
): Readonly<{ entry: NpcGlbCatalogEntry; lod: number | null }> | null {
  const variants = glbCatalogLods(entry)
    .slice()
    .sort((left, right) => left.level - right.level || left.sha256.localeCompare(right.sha256))
    .filter(candidate => catalogVariantFitsTier(candidate, tier));
  if (!variants.length) return null;
  const ordered = variants.slice().sort((left, right) => {
    if (preferredLod === null) return left.level - right.level || left.sha256.localeCompare(right.sha256);
    const rank = (level: number) => level >= preferredLod ? level - preferredLod : 10 + preferredLod - level;
    return rank(left.level) - rank(right.level) || left.level - right.level || left.sha256.localeCompare(right.sha256);
  });
  const candidate = ordered[0]!;
  return Object.freeze({
    entry: Object.freeze({
      ...entry,
      assetId: candidate.assetId,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      storageUrl: candidate.storageUrl,
      targetKey: candidate.targetKey,
      lods: [],
    }),
    lod: candidate.level,
  });
}

export function selectNpcGlb(
  catalog: GlbRuntimeCatalog | null | undefined,
  npcIdentity: string,
  preferredTargetKey?: string | null,
  preferredLod: number | null = null,
  tier: AssetTier | null = null,
): NpcGlbSelection | null {
  if (!catalog || !npcIdentity) return null;
  const exactTargetKey = preferredTargetKey ?? npcVisualTargetKey(npcIdentity);
  const assigned = catalog.entries.find(entry => entry.assetType === "character" && entry.targetKey === exactTargetKey);
  if (assigned) {
    const physical = selectPhysicalVariant(assigned, preferredLod, tier);
    if (!physical) return null;
    return Object.freeze({
      entry: physical.entry,
      source: "assigned",
      fallbackIndex: null,
      variantKey: assigned.displayName.startsWith(NPC_FALLBACK_DISPLAY_PREFIX) ? npcFallbackDescriptor(assigned).variantKey : null,
      lod: physical.lod,
    });
  }

  const variants = npcFallbackVariants(catalog)
    .map(variant => Object.freeze({
      variant,
      physical: variant.entries.filter(candidate => candidate.entry.bytes === null || tier === null || candidate.entry.bytes <= assetBudgets[tier].assetBytes),
    }))
    .filter(candidate => candidate.physical.length > 0);
  if (!variants.length) return null;

  const fallbackIndex = npcVisualIdentityHash(npcIdentity) % variants.length;
  const selected = variants[fallbackIndex]!;
  const physical = selectPhysicalVariant(selected.physical[0]!.entry, preferredLod, tier);
  if (!physical) return null;
  return Object.freeze({
    entry: physical.entry,
    source: "fallback",
    fallbackIndex,
    variantKey: selected.variant.key,
    lod: physical.lod,
  });
}
