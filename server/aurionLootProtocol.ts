import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { createHash } from "node:crypto";

/**
 * Data-driven deterministic loot resolver for server-confirmed Aurion encounters.
 * The caller must derive every context field from receipts and trusted catalog data.
 */
export const AURION_LOOT_RULESET_VERSION = "aurion-loot.v2" as const;

export const AURION_LOOT_V3_RULESET_VERSION = "aurion-loot.v3" as const;

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
  effectTags?: readonly string[];
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
  contract?: Readonly<{
    version: typeof AURION_LOOT_V3_RULESET_VERSION;
    catalogHash: string;
    source: Readonly<{ worldId: string; zoneId: string; encounterReceiptId: string; resolutionIndex: number; contentVersion: string }>;
    familyId: string;
    variantParameters: Readonly<{ itemLevelExact: string; affixBudget: number }>;
    effects: Readonly<{ stats: Readonly<Record<string, number>>; tags: readonly string[] }>;
  }>;
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
  const domain = context.ruleSetVersion === AURION_LOOT_V3_RULESET_VERSION ? `${AURION_LOOT_V3_RULESET_VERSION}:${context.contentVersion}` : AURION_LOOT_RULESET_VERSION;
  const raw = digest(domain, context.serverSeedDigest, context.encounterReceiptId, context.worldId, context.zoneId, context.monsterArchetypeId, String(context.resolutionIndex), label);
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
  const desired = context.ruleSetVersion === AURION_LOOT_V3_RULESET_VERSION ? Math.min(qualitySlots[quality], base.affixSlots.length) : qualitySlots[quality];
  if (desired === 0) return Object.freeze([]);
  const catalog = stableDefinitions(definitions);
  const groups = new Set<string>();
  const selected: ResolvedLootAffix[] = [];
  for (let index = 0; index < desired; index += 1) {
    const candidates = catalog.filter(affix => validAffix(affix, base, level, groups)
      && (context.ruleSetVersion !== AURION_LOOT_V3_RULESET_VERSION || !selected.some(prior => catalog.find(def => def.id === prior.id)?.excludesGroupIds?.includes(affix.groupId))));
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
  const v3 = input.context.ruleSetVersion === AURION_LOOT_V3_RULESET_VERSION;
  if (v3) {
    validateLootCatalogV3(input);
    for (const value of [input.context.worldId, input.context.zoneId, input.context.monsterArchetypeId, input.context.encounterReceiptId, input.context.contentVersion]) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("LOOT_V3_CONTEXT_INVALID");
    }
    if (!/^[a-f0-9]{64}$/.test(input.context.serverSeedDigest)) throw new Error("LOOT_V3_SEED_INVALID");
    for (const value of [input.context.playerLevelExact, input.context.zoneLevelExact, input.context.monsterLevelExact]) if (value.length > 128) throw new Error("LOOT_V3_LEVEL_BOUND");
  }
  let quality = qualityFor(input.context);
  const base = chooseBase(input.context, input.baseItems, itemLevel);
  // V3 special eligibility: a base without a set definition rolls rare instead.
  if (v3 && quality === "set" && !input.sets.some(set => set.pieceBaseItemIds.includes(base.id))) quality = "rare";
  const resolvedAffixes = chooseAffixes(input.context, base, quality, input.affixes, itemLevel);
  const setId = chooseSet(input.context, quality, base, input.sets);
  const itemPower = sumStats(base.baseStats) + resolvedAffixes.reduce((total, affix) => total + sumStats(affix.stats), 0);
  const resolvedContextHash = contextHash(input.context);
  const deterministicHash = digest(AURION_LOOT_RULESET_VERSION, resolvedContextHash, base.id, quality, itemLevel.toString(10), ...resolvedAffixes.flatMap(affix => [affix.id, affix.slot, affix.groupId, ...Object.entries(affix.stats).sort(([left], [right]) => textCompare(left, right)).map(([stat, value]) => `${stat}:${value}`)]), setId ?? "none", String(itemPower));
  if (v3) {
    const stats: Record<string, number> = { ...base.baseStats };
    for (const affix of resolvedAffixes) for (const [key, value] of Object.entries(affix.stats)) stats[key] = (stats[key] ?? 0) + value;
    if (Object.values(stats).some(value => !Number.isSafeInteger(value) || Math.abs(value) > 2147483647)) throw new Error("LOOT_V3_EFFECT_OVERFLOW");
    const contract = Object.freeze({ version: AURION_LOOT_V3_RULESET_VERSION,
      catalogHash: lootCatalogHashV3(input),
      source: Object.freeze({ worldId: input.context.worldId, zoneId: input.context.zoneId, encounterReceiptId: input.context.encounterReceiptId, resolutionIndex: input.context.resolutionIndex, contentVersion: input.context.contentVersion }),
      familyId: base.familyId, variantParameters: Object.freeze({ itemLevelExact: itemLevel.toString(10), affixBudget: Math.min(qualitySlots[quality], base.affixSlots.length) }),
      effects: Object.freeze({ stats: Object.freeze(stats), tags: Object.freeze([...(base.effectTags ?? [])].sort(textCompare)) }),
    });
    const power = lootItemPower(base, resolvedAffixes);
    const result = { itemDefinitionId: base.id, category: base.category, equipmentSlot: base.equipmentSlot, quality, itemLevelExact: itemLevel.toString(10), affixes: resolvedAffixes, setId, itemPower: power,
      contextHash: canonicalSha256({ domain: AURION_LOOT_V3_RULESET_VERSION, context: input.context }).slice(7), contract };
    return Object.freeze({ ...result, deterministicHash: canonicalSha256(result).slice(7) });
  }
  return Object.freeze({ itemDefinitionId: base.id, category: base.category, equipmentSlot: base.equipmentSlot, quality, itemLevelExact: itemLevel.toString(10), affixes: resolvedAffixes, setId, itemPower, contextHash: resolvedContextHash, deterministicHash });
}

/** Crafting shares Loot V2 eligibility, group constraints, labelled rolls and stat ranges. */
export function resolveLootAffixesForManipulation(input: Readonly<{
  context: ServerConfirmedLootContext; base: LootBaseDefinition; levelExact: string;
  catalog: readonly LootAffixDefinition[]; count: number; retained?: readonly ResolvedLootAffix[];
}>): readonly ResolvedLootAffix[] {
  assertContext(input.context);
  const level = parseExact(input.levelExact, "manipulation level");
  if (!validBase(input.base, level)) throw new Error("AURION_ITEM_BASE_LEVEL_INVALID");
  const selected = [...(input.retained ?? [])];
  if (!Number.isSafeInteger(input.count) || input.count < 0 || selected.length + input.count > 5) throw new Error("AURION_ITEM_AFFIX_SLOT_BOUND_INVALID");
  const catalog = stableDefinitions(input.catalog);
  const groups = new Set<string>();
  for (const affix of selected) {
    const definition = catalog.find(candidate => candidate.id === affix.id);
    if (!definition || !validAffix(definition, input.base, level, groups) || definition.slot !== affix.slot || definition.groupId !== affix.groupId) throw new Error("AURION_ITEM_RETAINED_AFFIX_INVALID");
    for (const [stat, range] of Object.entries(definition.statRanges)) {
      const value = affix.stats[stat];
      if (!Number.isSafeInteger(value) || value < range.min || value > range.max) throw new Error("AURION_ITEM_RETAINED_STAT_INVALID");
    }
    if (Object.keys(affix.stats).length !== Object.keys(definition.statRanges).length) throw new Error("AURION_ITEM_RETAINED_STAT_INVALID");
    groups.add(affix.groupId);
  }
  for (let index = 0; index < input.count; index++) {
    const candidates = catalog.filter(candidate => validAffix(candidate, input.base, level, groups)
      && !selected.some(prior => catalog.find(d => d.id === prior.id)?.excludesGroupIds?.includes(candidate.groupId)));
    if (!candidates.length) throw new Error("AURION_ITEM_AFFIX_POOL_EMPTY");
    const definition = candidates[deterministicRoll(input.context, `manipulation-affix:${index}`, candidates.length)]!;
    groups.add(definition.groupId);
    selected.push(Object.freeze({ id: definition.id, slot: definition.slot, groupId: definition.groupId, stats: resolveAffixStats(input.context, definition, index) }));
  }
  return Object.freeze(selected.sort((a, b) => textCompare(a.slot, b.slot) || textCompare(a.id, b.id)));
}

export function lootItemPower(base: LootBaseDefinition, affixes: readonly ResolvedLootAffix[]): number {
  const power = sumStats(base.baseStats) + affixes.reduce((sum, affix) => sum + sumStats(affix.stats), 0);
  if (!Number.isSafeInteger(power) || power > 2_147_483_647) throw new Error("AURION_ITEM_POWER_OVERFLOW");
  return power;
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


/** Reserved utility taxonomy is not a reward until a catalog and persistence type exist. */
export const aurionRewardTaxonomyV3 = Object.freeze({
  active: aurionItemCategories,
  reserved: Object.freeze(["utility"] as const),
});
type LootCatalog = Readonly<{ baseItems: readonly LootBaseDefinition[]; affixes: readonly LootAffixDefinition[]; sets: readonly LootSetDefinition[] }>;
export function validateLootCatalogV3(catalog: LootCatalog): void {
  const token = (value: string) => { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("LOOT_V3_TOKEN_INVALID"); };
  const list = (values: readonly string[], allowed?: readonly string[]) => {
    if (values.length > 64 || new Set(values).size !== values.length) throw new Error("LOOT_V3_LIST_INVALID");
    for (const value of values) { token(value); if (allowed && !allowed.includes(value)) throw new Error("LOOT_V3_ENUM_INVALID"); }
  };
  const stats = (values: Readonly<Record<string, number>>) => {
    if (Object.keys(values).length > 64) throw new Error("LOOT_V3_STAT_BOUND");
    for (const [key, value] of Object.entries(values)) { token(key); if (!Number.isSafeInteger(value) || Math.abs(value) > 2147483647) throw new Error("LOOT_V3_STAT_INVALID"); }
  };
  const levels = (value: { minItemLevelExact: string; maxItemLevelExact?: string }) => {
    if (value.minItemLevelExact.length > 128 || (value.maxItemLevelExact?.length ?? 0) > 128) throw new Error("LOOT_V3_LEVEL_BOUND");
    const min = parseExact(value.minItemLevelExact, "min level");
    if (value.maxItemLevelExact !== undefined && parseExact(value.maxItemLevelExact, "max level") < min) throw new Error("LOOT_V3_LEVEL_RANGE");
  };
  if (!catalog.baseItems.length || catalog.baseItems.length > 4096 || catalog.affixes.length > 2048 || catalog.sets.length > 512) throw new Error("LOOT_V3_CATALOG_BOUND");
  for (const base of stableDefinitions(catalog.baseItems)) {
    token(base.id); token(base.familyId); levels(base); stats(base.baseStats);
    if (!aurionItemCategories.includes(base.category)) throw new Error("LOOT_V3_CATEGORY_INVALID");
    const slots: Partial<Record<AurionItemCategory, readonly AurionEquipmentSlot[]>> = {
      weapon: ["main_hand", "off_hand"], armor: ["head", "chest", "hands", "legs", "feet", "belt"], accessory: ["ring", "amulet"], focus: ["focus"], relic: ["relic"],
    };
    if (slots[base.category] ? !slots[base.category]!.includes(base.equipmentSlot!) : base.equipmentSlot !== undefined) throw new Error("LOOT_V3_SLOT_INVALID");
    list(base.affixSlots, aurionAffixSlots); list(base.tags); list(base.effectTags ?? []);
  }
  for (const affix of stableDefinitions(catalog.affixes)) {
    token(affix.id); token(affix.groupId); levels(affix);
    list([affix.slot], aurionAffixSlots); list(affix.allowedCategories, aurionItemCategories); list(affix.requiredTags ?? []); list(affix.excludesGroupIds ?? []);
    if (!Object.keys(affix.statRanges).length || Object.keys(affix.statRanges).length > 64) throw new Error("LOOT_V3_STAT_BOUND");
    for (const [key, range] of Object.entries(affix.statRanges)) { stats({ [key]: range.min }); stats({ [key]: range.max }); if (range.min > range.max) throw new Error("LOOT_V3_STAT_RANGE"); }
  }
  const ids = new Set(catalog.baseItems.map(base => base.id));
  for (const set of stableDefinitions(catalog.sets)) {
    token(set.id); list(set.pieceBaseItemIds);
    if (!set.pieceBaseItemIds.length || set.pieceBaseItemIds.some(id => !ids.has(id))) throw new Error("LOOT_V3_SET_REFERENCE");
    for (const [count, bonus] of Object.entries(set.bonusesByPieces)) {
      if (!/^[1-9][0-9]*$/.test(count) || BigInt(count) > BigInt(set.pieceBaseItemIds.length)) throw new Error("LOOT_V3_SET_THRESHOLD");
      stats(bonus);
    }
  }
}
export function lootCatalogHashV3(catalog: LootCatalog): string {
  return canonicalSha256({ domain: "aurion.loot-catalog.v3",
    baseItems: stableDefinitions(catalog.baseItems).map(base => ({ ...base, tags: [...base.tags].sort(textCompare), effectTags: [...(base.effectTags ?? [])].sort(textCompare), affixSlots: [...base.affixSlots].sort(textCompare) })),
    affixes: stableDefinitions(catalog.affixes).map(affix => ({ ...affix, allowedCategories: [...affix.allowedCategories].sort(textCompare), requiredTags: [...(affix.requiredTags ?? [])].sort(textCompare), excludesGroupIds: [...(affix.excludesGroupIds ?? [])].sort(textCompare) })),
    sets: stableDefinitions(catalog.sets).map(set => ({ ...set, pieceBaseItemIds: [...set.pieceBaseItemIds].sort(textCompare) })),
  });
}
