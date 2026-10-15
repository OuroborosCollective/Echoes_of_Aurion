import { ENEMY_FALLBACK_DISPLAY_PREFIX, glbCatalogLods, type GlbLodLevel, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { assetBudgets, type AssetTier } from "@shared/glbPresentationBudget";
import type { ZoneMobArchetype } from "@shared/zoneMobContract";

export type EnemyGlbCatalogEntry = GlbRuntimeCatalog["entries"][number];

export type EnemyGlbSelection = Readonly<{
  entry: EnemyGlbCatalogEntry;
  variantKey: string;
  lod: GlbLodLevel;
  tier: AssetTier;
}>;

type PhysicalEnemyCandidate = Readonly<{
  entry: EnemyGlbCatalogEntry & Readonly<{ bytes: number | null }>;
  lod: GlbLodLevel;
}>;
type EnemyFallbackVariant = Readonly<{
  key: string;
  entries: readonly PhysicalEnemyCandidate[];
}>;

const CATEGORY_ALIASES: Readonly<Record<ZoneMobArchetype, readonly string[]>> = Object.freeze({
  clockwork_stalker: ["clockwork", "stalker", "construct", "automaton"],
  corrupted_golem: ["golem", "construct", "stone", "iron"],
  aether_wisp: ["wisp", "spirit", "aether"],
  steam_drake: ["drake", "dragon", "steam"],
  centurion_elite: ["centurion", "elite", "automaton", "knight"],
  titan_boss: ["titan", "boss", "giant", "construct"],
});

export function enemyVisualIdentityHash(identity: string): number {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

export function isEnemyFallbackCatalogEntry(entry: EnemyGlbCatalogEntry): boolean {
  if (entry.assetType !== "enemy" || entry.targetKey !== null) return false;
  return entry.purpose === "enemy-fallback"
    ? entry.displayName.startsWith(ENEMY_FALLBACK_DISPLAY_PREFIX)
    : entry.purpose === "auto";
}

export function enemyFallbackPool(catalog: GlbRuntimeCatalog | null | undefined): EnemyGlbCatalogEntry[] {
  if (!catalog) return [];
  return catalog.entries
    .filter(isEnemyFallbackCatalogEntry)
    .slice()
    .sort((left, right) => (left.sha256 < right.sha256 ? -1 : left.sha256 > right.sha256 ? 1 : 0) || (left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0));
}

function descriptor(entry: EnemyGlbCatalogEntry): { variantKey: string; lod: number | null } {
  const raw = (entry.displayName.startsWith(ENEMY_FALLBACK_DISPLAY_PREFIX)
    ? entry.displayName.slice(ENEMY_FALLBACK_DISPLAY_PREFIX.length)
    : entry.displayName).trim();
  const lodMatch = raw.match(/(?:^|\s)LOD\s*([0-9]+)(?=\s|$)/i);
  const lod = lodMatch ? Number.parseInt(lodMatch[1]!, 10) : null;
  const variantKey = raw
    .replace(/(?:^|\s)LOD\s*[0-9]+(?=\s|$)/ig, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return { variantKey: variantKey || raw.toLowerCase(), lod };
}

function physicalFamilyEntries(entry: EnemyGlbCatalogEntry): readonly PhysicalEnemyCandidate[] {
  if (!entry.lods?.length) return Object.freeze([{
    lod: (descriptor(entry).lod ?? 0) as GlbLodLevel,
    entry: Object.freeze({ ...entry, bytes: null }),
  }]);
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

export function enemyFallbackVariants(catalog: GlbRuntimeCatalog | null | undefined): readonly EnemyFallbackVariant[] {
  const grouped = new Map<string, PhysicalEnemyCandidate[]>();
  for (const entry of enemyFallbackPool(catalog)) {
    const key = descriptor(entry).variantKey;
    const current = grouped.get(key) ?? [];
    current.push(...physicalFamilyEntries(entry));
    grouped.set(key, current);
  }
  return Object.freeze([...grouped.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entries]) => Object.freeze({
      key,
      entries: Object.freeze(entries.slice().sort(
        (left, right) => (left.lod ?? Number.MAX_SAFE_INTEGER) - (right.lod ?? Number.MAX_SAFE_INTEGER)
          || (left.entry.sha256 < right.entry.sha256 ? -1 : left.entry.sha256 > right.entry.sha256 ? 1 : 0),
      )),
    })));
}

function fitsTier(entry: EnemyGlbCatalogEntry & Readonly<{ bytes: number | null }>, tier: AssetTier): boolean {
  return entry.bytes === null || entry.bytes <= assetBudgets[tier].assetBytes;
}

export type EnemyFallbackDiagnostics = Readonly<{
  fallbackCandidates: number;
  matchedCandidates: number;
  budgetRejected: number;
  compatibleCandidates: number;
  bestMatchScore: number | null;
}>;

/**
 * Returns the same candidate accounting used by selectEnemyGlb without making
 * a visual claim or touching gameplay state. Counts physical candidates, so a
 * fallback family with several LOD members is visible as several budget checks.
 */
export function enemyFallbackDiagnostics(
  catalog: GlbRuntimeCatalog | null | undefined,
  archetype: ZoneMobArchetype,
  tier: AssetTier,
): EnemyFallbackDiagnostics {
  const variants = enemyFallbackVariants(catalog);
  const evaluated = variants.map(variant => ({
    score: variant.key.startsWith("rigged-monster · monster ") ? 1 : variant.entries[0]?.entry.purpose === "auto" ? Math.max(2, matchScore(variant.key, archetype)) : matchScore(variant.key, archetype),
    physical: variant.entries,
  }));
  const bestMatchScore = evaluated.length ? Math.min(...evaluated.map(candidate => candidate.score)) : null;
  const matched = bestMatchScore === null ? [] : evaluated.filter(candidate => candidate.score === bestMatchScore);
  const physical = matched.flatMap(candidate => candidate.physical);
  const compatibleCandidates = physical.filter(candidate => fitsTier(candidate.entry, tier)).length;
  return Object.freeze({
    fallbackCandidates: variants.length,
    matchedCandidates: matched.length,
    budgetRejected: physical.length - compatibleCandidates,
    compatibleCandidates,
    bestMatchScore,
  });
}

function matchScore(key: string, archetype: ZoneMobArchetype): number {
  const normalized = key.replace(/[^a-z0-9]+/g, " ");
  const aliases = CATEGORY_ALIASES[archetype];
  if (normalized.includes(archetype.replace(/_/g, " "))) return 0;
  if (aliases.some(alias => normalized.includes(alias))) return 1;
  return 2;
}

/** Deterministic presentation-only enemy selection. No gameplay state is read or mutated. */
export function selectEnemyGlb(
  catalog: GlbRuntimeCatalog | null | undefined,
  archetype: ZoneMobArchetype,
  preferredLod: number,
  tier: AssetTier,
  entityIdentity: string = archetype,
  fallbackOffset = 0,
): EnemyGlbSelection | null {
  const eligible = enemyFallbackVariants(catalog)
    .map((variant, index) => Object.freeze({
      variant,
      // Imported Quaternius creature families are a deliberate visual pool, not
      // semantic matches to one of the six authoritative combat archetypes.
      score: variant.key.startsWith("rigged-monster · monster ") ? 1 : variant.entries[0]?.entry.purpose === "auto" ? Math.max(2, matchScore(variant.key, archetype)) : matchScore(variant.key, archetype),
      physical: variant.entries.filter(candidate => fitsTier(candidate.entry, tier)),
    }))
    .filter(candidate => candidate.physical.length > 0);
  if (!eligible.length) return null;

  const bestScore = Math.min(...eligible.map(candidate => candidate.score));
  const ranked = eligible.filter(candidate => candidate.score === bestScore);
  // Numbered confirmed entities walk the sorted approved families without hash
  // collisions. A non-numbered identity retains stable FNV selection.
  const identityNumber = /(?:^|:)mob_([1-9][0-9]*)$/.exec(entityIdentity);
  const ordinal = identityNumber ? Number(identityNumber[1]) : NaN;
  const index = Number.isSafeInteger(ordinal)
    ? (enemyVisualIdentityHash(entityIdentity.slice(0, identityNumber!.index)) % ranked.length + (ordinal - 1) % ranked.length) % ranked.length
    : enemyVisualIdentityHash(entityIdentity) % ranked.length;
  const selected = ranked[(index + Math.max(0, Math.trunc(fallbackOffset))) % ranked.length]!;
  const candidates = selected.physical.slice().sort((left, right) => {
    const leftLod = left.lod ?? Number.MAX_SAFE_INTEGER;
    const rightLod = right.lod ?? Number.MAX_SAFE_INTEGER;
    const rank = (level: number) => level >= preferredLod ? level - preferredLod : 10 + preferredLod - level;
    return rank(leftLod) - rank(rightLod) || left.entry.sha256.localeCompare(right.entry.sha256);
  });
  const physical = candidates[0];
  if (!physical) return null;
  return Object.freeze({
    entry: physical.entry,
    variantKey: selected.variant.key,
    lod: (physical.lod ?? 0) as GlbLodLevel,
    tier,
  });
}
