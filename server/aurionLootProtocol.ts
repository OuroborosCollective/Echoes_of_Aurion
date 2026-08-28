import { createHash } from "node:crypto";

/**
 * Data-driven deterministic loot resolver for server-confirmed Aurion encounters.
 * The caller must derive every context field from receipts and trusted catalog data.
 */
export const AURION_LOOT_RULESET_VERSION = "aurion-loot.v2" as const;

export const aurionItemCategories = ["weapon", "armor", "accessory", "focus", "relic", "crafting_component", "shaping_component"] as const;
export type AurionItemCategory = (typeof aurionItemCategories)[number];
export const aurionEquipmentSlots = ["main_hand", "off_hand", "head", "chest", "hands", "legs", "feet", "belt", "ring", "amulet", "focus", "relic"] as const;
export type AurionEquipmentSlot = (typeof aurionEquipmentSlots)[number];
export const aurionLootQualities = ["normal", "magic", "rare", "set", "unique", "mythic"] as const;
export type AurionLootQuality = (typeof aurionLootQualities)[number];
export const aurionAffixSlots = ["prefix", "suffix", "implicit", "corruption", "craft"] as const;
export type AurionAffixSlot = (typeof aurionAffixSlots)[number];

export type ExactRange = Readonly<{ min: number; max: number }>;
export type LootBaseDefinition = Readonly<{
  id: string;
  category: AurionItemCategory;
  equipmentSlot?: AurionEquipmentSlot;
  familyId: string;
  minItemLevelExact: string;
  maxItemLevelExact?: string;
  baseStats: Readonly<Record<string, number>>;
  affixSlots: readonly AurionAffixSlot[];
  tags: readonly string[];
}>;
export type LootAffixDefinition = Readonly<{
  id: string;
  slot: AurionAffixSlot;
  groupId: string;
  minItemLevelExact: string;
  maxItemLevelExact?: string;
  allowedCategories: readonly AurionItemCategory[];
  requiredTags?: readonly string[];
  excludesGroupIds?: readonly string[];
  statRanges: Readonly<Record<string, ExactRange>>;
}>;
export type LootSetDefinition = Readonly<{
  id: string;
  pieceBaseItemIds: readonly string[];
  bonusesByPieces: Readonly<Record<string, Readonly<Record<string, number>>>>;
}>;

/** `resolutionIndex` is Aurion's deterministic time input; no wall-clock time enters a roll. */
export type ServerConfirmedLootContext = Readonly<{
  worldId: string;
  zoneId: string;
  monsterArchetypeId: string;
  encounterReceiptId: string;
  ruleSetVersion: string;
  contentVersion: string;
  resolutionIndex: number;
  playerLevelExact: string;
  zoneLevelExact: string;
  monsterLevelExact: string;
  luckBps: number;
  serverSeedDigest: string;
}>;

export type ResolvedLootAffix = Readonly<{
  id: string;
  slot: AurionAffixSlot;
  groupId: string;
  stats: Readonly<Record<string, number>>;
}>;
export type DeterministicLootResult = Readonly<{
  itemDefinitionId: string;
  category: AurionItemCategory;
  equipmentSlot?: AurionEquipmentSlot;
  quality: AurionLootQuality;
  itemLevelExact: string;
  affixes: readonly ResolvedLootAffix[];
  setId?: string;
  itemPower: number;
  contextHash: string;
  deterministicHash: string;
}>;

const qualitySlots: Readonly<Record<AurionLootQuality, number>> = Object.freeze({ normal: 0, magic: 1, rare: 3, set: 3, unique: 4, mythic: 5 });
const qualityOrder: readonly AurionLootQuality[] = ["mythic", "unique", "set", "rare", "magic", "normal"];
const textCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const digest = (...parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

function parseExact(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical non-negative decimal`);
  return BigInt(value);
}

function normalizeBps(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return Math.max(0, Math.min(5_000, value));
}

function deterministicRoll(context: ServerConfirmedLootContext, label: string, maximumExclusive: number): number {
  if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive < 1) throw new Error("loot roll bound must be a positive integer");
  const raw = digest(AURION_LOOT_RULESET_VERSION, context.serverSeedDigest, context.encounterReceiptId, context.worldId, context.zoneId, context.monsterArchetypeId, String(context.resolutionIndex), label);
  return Number.parseInt(raw.slice(0, 12), 16) % maximumExclusive;
}

function assertContext(context: ServerConfirmedLootContext): void {
  for (const value of [context.worldId, context.zoneId, context.monsterArchetypeId, context.encounterReceiptId, context.ruleSetVersion, context.contentVersion, context.serverSeedDigest]) {
    if (!value.trim()) throw new Error("loot context requires stable server-confirmed identifiers");
  }
  if (!Number.isSafeInteger(context.resolutionIndex) || context.resolutionIndex < 0) throw new Error("loot resolutionIndex must be a non-negative safe integer");
  parseExact(context.playerLevelExact, "playerLevelExact");
  parseExact(context.zoneLevelExact, "zoneLevelExact");
  parseExact(context.monsterLevelExact, "monsterLevelExact");
  normalizeBps(context.luckBps, "luckBps");
}

function contextHash(context: ServerConfirmedLootContext): string {
  return digest(AURION_LOOT_RULESET_VERSION, context.worldId, context.zoneId, context.monsterArchetypeId, context.encounterReceiptId, context.ruleSetVersion, context.contentVersion, String(context.resolutionIndex), context.playerLevelExact, context.zoneLevelExact, context.monsterLevelExact, String(context.luckBps), context.serverSeedDigest);
}

function qualityFor(context: ServerConfirmedLootContext): AurionLootQuality {
  const luck = normalizeBps(context.luckBps, "luckBps");
  const roll = deterministicRoll(context, "quality", 10_000);
  const thresholds: Readonly<Record<AurionLootQuality, number>> = {
    mythic: 5 + Math.floor(luck / 800),
    unique: 45 + Math.floor(luck / 120),
    set: 150 + Math.floor(luck / 80),
    rare: 1_000 + Math.floor(luck / 10),
    magic: 2_800 + Math.floor(luck / 4),
    normal: 10_000,
  };
  let boundary = 0;
  for (const quality of qualityOrder) {
    boundary += thresholds[quality];
    if (roll < boundary) return quality;
  }
  return "normal";
}

function levelFor(context: ServerConfirmedLootContext): bigint {
  const player = parseExact(context.playerLevelExact, "playerLevelExact");
  const zone = parseExact(context.zoneLevelExact, "zoneLevelExact");
  const monster = parseExact(context.monsterLevelExact, "monsterLevelExact");
  return [player, zone, monster].reduce((highest, level) => level > highest ? level : highest, BigInt(1));
}

function validBase(definition: LootBaseDefinition, level: bigint): boolean {
  const minimum = parseExact(definition.minItemLevelExact, `${definition.id}.minItemLevelExact`);
  const maximum = definition.maxItemLevelExact ? parseExact(definition.maxItemLevelExact, `${definition.id}.maxItemLevelExact`) : undefined;
  return level >= minimum && (!maximum || level <= maximum);
}

function stableDefinitions<T extends { id: string }>(definitions: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const sorted = definitions.slice().sort((left, right) => textCompare(left.id, right.id));
  for (const definition of sorted) {
    if (!definition.id || seen.has(definition.id)) throw new Error("loot catalog requires unique stable definition IDs");
    seen.add(definition.id);
  }
  return sorted;
}

function chooseBase(context: ServerConfirmedLootContext, definitions: readonly LootBaseDefinition[], level: bigint): LootBaseDefinition {
  const candidates = stableDefinitions(definitions).filter(definition => validBase(definition, level));
  if (candidates.length === 0) throw new Error("loot catalog has no base item for the resolved level");
  return candidates[deterministicRoll(context, "base", candidates.length)]!;
}

function intersects(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return !left || left.length === 0 || left.some(value => right.includes(value));
}

function validAffix(affix: LootAffixDefinition, base: LootBaseDefinition, level: bigint, selectedGroups: ReadonlySet<string>): boolean {
  const minimum = parseExact(affix.minItemLevelExact, `${affix.id}.minItemLevelExact`);
  const maximum = affix.maxItemLevelExact ? parseExact(affix.maxItemLevelExact, `${affix.id}.maxItemLevelExact`) : undefined;
  return level >= minimum
    && (!maximum || level <= maximum)
    && base.affixSlots.includes(affix.slot)
    && affix.allowedCategories.includes(base.category)
    && intersects(affix.requiredTags, base.tags)
    && !selectedGroups.has(affix.groupId)
    && !(affix.excludesGroupIds ?? []).some(group => selectedGroups.has(group));
}

function resolveAffixStats(context: ServerConfirmedLootContext, affix: LootAffixDefinition, index: number): Readonly<Record<string, number>> {
  const entries = Object.entries(affix.statRanges).sort(([left], [right]) => textCompare(left, right));
  if (entries.length === 0) throw new Error(`loot affix ${affix.id} requires at least one stat range`);
  return Object.freeze(Object.fromEntries(entries.map(([stat, range]) => {
    if (!Number.isSafeInteger(range.min) || !Number.isSafeInteger(range.max) || range.min > range.max) throw new Error(`loot affix ${affix.id} has an invalid ${stat} range`);
    const value = range.min + deterministicRoll(context, `affix-stat:${affix.id}:${stat}:${index}`, range.max - range.min + 1);
    return [stat, value];
  })));
}

function chooseAffixes(context: ServerConfirmedLootContext, base: LootBaseDefinition, quality: AurionLootQuality, definitions: readonly LootAffixDefinition[], level: bigint): readonly ResolvedLootAffix[] {
  const desired = qualitySlots[quality];
  if (desired === 0) return Object.freeze([]);
  const catalog = stableDefinitions(definitions);
  const groups = new Set<string>();
  const selected: ResolvedLootAffix[] = [];
  for (let index = 0; index < desired; index += 1) {
    const candidates = catalog.filter(affix => validAffix(affix, base, level, groups));
    if (candidates.length === 0) throw new Error("loot catalog has insufficient compatible affixes for the resolved quality");
    const affix = candidates[deterministicRoll(context, `affix:${index}`, candidates.length)]!;
    groups.add(affix.groupId);
    selected.push(Object.freeze({ id: affix.id, slot: affix.slot, groupId: affix.groupId, stats: resolveAffixStats(context, affix, index) }));
  }
  return Object.freeze(selected.sort((left, right) => textCompare(left.slot, right.slot) || textCompare(left.id, right.id)));
}

function chooseSet(context: ServerConfirmedLootContext, quality: AurionLootQuality, base: LootBaseDefinition, definitions: readonly LootSetDefinition[]): string | undefined {
  if (quality !== "set") return undefined;
  const candidates = stableDefinitions(definitions).filter(definition => definition.pieceBaseItemIds.includes(base.id));
  if (candidates.length === 0) return undefined;
  return candidates[deterministicRoll(context, "set", candidates.length)]!.id;
}

function sumStats(stats: Readonly<Record<string, number>>): number {
  return Object.values(stats).reduce((total, value) => total + Math.abs(value), 0);
}

export function resolveDeterministicLoot(input: Readonly<{
  context: ServerConfirmedLootContext;
  baseItems: readonly LootBaseDefinition[];
  affixes: readonly LootAffixDefinition[];
  sets: readonly LootSetDefinition[];
}>): DeterministicLootResult {
  assertContext(input.context);
  const itemLevel = levelFor(input.context);
  const quality = qualityFor(input.context);
  const base = chooseBase(input.context, input.baseItems, itemLevel);
  const resolvedAffixes = chooseAffixes(input.context, base, quality, input.affixes, itemLevel);
  const setId = chooseSet(input.context, quality, base, input.sets);
  const itemPower = sumStats(base.baseStats) + resolvedAffixes.reduce((total, affix) => total + sumStats(affix.stats), 0);
  const resolvedContextHash = contextHash(input.context);
  const deterministicHash = digest(AURION_LOOT_RULESET_VERSION, resolvedContextHash, base.id, quality, itemLevel.toString(10), ...resolvedAffixes.flatMap(affix => [affix.id, affix.slot, affix.groupId, ...Object.entries(affix.stats).sort(([left], [right]) => textCompare(left, right)).map(([stat, value]) => `${stat}:${value}`)]), setId ?? "none", String(itemPower));
  return Object.freeze({ itemDefinitionId: base.id, category: base.category, equipmentSlot: base.equipmentSlot, quality, itemLevelExact: itemLevel.toString(10), affixes: resolvedAffixes, setId, itemPower, contextHash: resolvedContextHash, deterministicHash });
}

/** Counts configuration paths without rolling a reward; useful for content-budget and combinatorics checks. */
export function estimateLootVariantUpperBound(input: Readonly<{ baseItemCount: number; affixGroupCount: number; maxAffixSlots: number; qualityCount?: number; levelBands: number }>): string {
  for (const value of [input.baseItemCount, input.affixGroupCount, input.maxAffixSlots, input.levelBands]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("loot variant inputs must be non-negative safe integers");
  const qualityCount = input.qualityCount ?? aurionLootQualities.length;
  if (!Number.isSafeInteger(qualityCount) || qualityCount < 1) throw new Error("qualityCount must be a positive safe integer");
  let permutations = BigInt(1);
  for (let slot = 0; slot < input.maxAffixSlots; slot += 1) permutations *= BigInt(Math.max(1, input.affixGroupCount - slot));
  return (BigInt(input.baseItemCount) * BigInt(qualityCount) * BigInt(input.levelBands) * permutations).toString(10);
}

/** Set bonuses derive from equipped, confirmed pieces; inventory ownership alone is insufficient. */
export function resolveEquippedSetBonuses(input: Readonly<{ equippedBaseItemIds: readonly string[]; sets: readonly LootSetDefinition[] }>): Readonly<Record<string, number>> {
  const equipped = new Set(input.equippedBaseItemIds.filter(Boolean));
  const totals = new Map<string, number>();
  for (const definition of stableDefinitions(input.sets)) {
    const pieces = definition.pieceBaseItemIds.filter(piece => equipped.has(piece)).length;
    const thresholds = Object.entries(definition.bonusesByPieces)
      .map(([threshold, bonuses]) => ({ threshold: Number.parseInt(threshold, 10), bonuses }))
      .sort((left, right) => left.threshold - right.threshold);
    for (const { threshold, bonuses } of thresholds) {
      if (!Number.isSafeInteger(threshold) || threshold < 1 || pieces < threshold) continue;
      for (const [stat, amount] of Object.entries(bonuses).sort(([left], [right]) => textCompare(left, right))) {
        if (!Number.isSafeInteger(amount)) throw new Error(`set ${definition.id} has a non-integer bonus`);
        totals.set(stat, (totals.get(stat) ?? 0) + amount);
      }
    }
  }
  return Object.freeze(Object.fromEntries(Array.from(totals.entries()).sort(([left], [right]) => textCompare(left, right))));
}
