import { canonicalSha256 } from "../shared/aurionCanonicalHash";

export const AURION_MODIFIER_RULESET_VERSION = "aurion-modifier.v1" as const;
export const aurionModifierSourceKinds = [
  "equipment",
  "skill",
  "effect",
  "consumable",
  "rule",
] as const;
export const aurionModifierOperations = [
  "add",
  "scale_bps",
  "min",
  "max",
] as const;
export const aurionModifierStacking = ["sum", "highest", "lowest"] as const;

export type AurionModifierSourceKind =
  (typeof aurionModifierSourceKinds)[number];
export type AurionModifierOperation = (typeof aurionModifierOperations)[number];
export type AurionModifierStacking = (typeof aurionModifierStacking)[number];

export type AurionModifierCondition = Readonly<{
  stat: string;
  comparison: "gte" | "lte" | "eq";
  value: number;
}>;

export type AurionModifierSource = Readonly<{
  kind: AurionModifierSourceKind;
  id: string;
  revision: string;
  evidenceHash: string;
}>;

export type AurionModifier = Readonly<{
  modifierId: string;
  source: AurionModifierSource;
  stat: string;
  operation: AurionModifierOperation;
  amount: number;
  priority: number;
  stackingGroup: string;
  stacking: AurionModifierStacking;
  condition?: AurionModifierCondition;
  startsAtTick?: number;
  expiresAtTick?: number;
}>;

export type AurionDerivedStatsInput = Readonly<{
  baseStats: Readonly<Record<string, number>>;
  modifiers: readonly AurionModifier[];
  logicalTick: number;
}>;

export type AurionDerivedStats = Readonly<{
  rulesetVersion: typeof AURION_MODIFIER_RULESET_VERSION;
  logicalTick: number;
  stats: Readonly<Record<string, number>>;
  activeModifiers: readonly AurionModifier[];
  sourceSetHash: string;
  derivedStatsHash: string;
}>;

const MAX_MODIFIERS = 1_024;
const MAX_STATS = 128;
const MAX_TOTAL_SCALE_BPS = 1_000_000;
const BPS = 10_000;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const textCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function assertToken(value: string, code: string): void {
  if (!TOKEN.test(value)) throw new Error(code);
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(code);
}

function canonicalStats(
  stats: Readonly<Record<string, number>>,
  code: string
): Readonly<Record<string, number>> {
  const entries = Object.entries(stats).sort(([left], [right]) =>
    textCompare(left, right)
  );
  if (entries.length > MAX_STATS) throw new Error(`${code}_TOO_MANY`);
  const result: Record<string, number> = {};
  for (const [stat, value] of entries) {
    assertToken(stat, `${code}_STAT`);
    assertSafeInteger(value, `${code}_VALUE`);
    result[stat] = value;
  }
  return Object.freeze(result);
}

function safeNumber(value: bigint, code: string): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error(code);
  return Number(value);
}

function sum(values: readonly number[], code: string): number {
  return safeNumber(
    values.reduce((total, value) => total + BigInt(value), 0n),
    code
  );
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator < 0n && numerator % denominator !== 0n
    ? quotient - 1n
    : quotient;
}

function canonicalCondition(
  condition: AurionModifierCondition | undefined
): AurionModifierCondition | undefined {
  if (!condition) return undefined;
  assertToken(condition.stat, "AURION_MODIFIER_CONDITION_STAT_INVALID");
  if (!(["gte", "lte", "eq"] as const).includes(condition.comparison))
    throw new Error("AURION_MODIFIER_CONDITION_COMPARISON_INVALID");
  assertSafeInteger(condition.value, "AURION_MODIFIER_CONDITION_VALUE_INVALID");
  return Object.freeze({
    stat: condition.stat,
    comparison: condition.comparison,
    value: condition.value,
  });
}

function canonicalModifier(modifier: AurionModifier): AurionModifier {
  assertToken(modifier.modifierId, "AURION_MODIFIER_ID_INVALID");
  assertToken(modifier.stat, "AURION_MODIFIER_STAT_INVALID");
  assertToken(modifier.stackingGroup, "AURION_MODIFIER_STACKING_GROUP_INVALID");
  assertToken(modifier.source.id, "AURION_MODIFIER_SOURCE_ID_INVALID");
  assertToken(
    modifier.source.revision,
    "AURION_MODIFIER_SOURCE_REVISION_INVALID"
  );
  if (
    !(aurionModifierSourceKinds as readonly string[]).includes(
      modifier.source.kind
    )
  )
    throw new Error("AURION_MODIFIER_SOURCE_KIND_INVALID");
  if (!SHA256.test(modifier.source.evidenceHash))
    throw new Error("AURION_MODIFIER_SOURCE_EVIDENCE_INVALID");
  if (
    !(aurionModifierOperations as readonly string[]).includes(
      modifier.operation
    )
  )
    throw new Error("AURION_MODIFIER_OPERATION_INVALID");
  if (
    !(aurionModifierStacking as readonly string[]).includes(modifier.stacking)
  )
    throw new Error("AURION_MODIFIER_STACKING_INVALID");
  assertSafeInteger(modifier.amount, "AURION_MODIFIER_AMOUNT_INVALID");
  assertSafeInteger(modifier.priority, "AURION_MODIFIER_PRIORITY_INVALID");
  if (modifier.priority < 0 || modifier.priority > 10_000)
    throw new Error("AURION_MODIFIER_PRIORITY_OUT_OF_RANGE");
  if (
    modifier.operation === "scale_bps" &&
    (modifier.amount < -BPS || modifier.amount > MAX_TOTAL_SCALE_BPS)
  )
    throw new Error("AURION_MODIFIER_SCALE_BPS_OUT_OF_RANGE");
  const startsAtTick = modifier.startsAtTick ?? 0;
  assertSafeInteger(startsAtTick, "AURION_MODIFIER_START_TICK_INVALID");
  if (startsAtTick < 0) throw new Error("AURION_MODIFIER_START_TICK_INVALID");
  if (modifier.expiresAtTick !== undefined) {
    assertSafeInteger(
      modifier.expiresAtTick,
      "AURION_MODIFIER_EXPIRY_TICK_INVALID"
    );
    if (modifier.expiresAtTick <= startsAtTick)
      throw new Error("AURION_MODIFIER_EXPIRY_TICK_INVALID");
  }
  const condition = canonicalCondition(modifier.condition);
  return Object.freeze({
    modifierId: modifier.modifierId,
    source: Object.freeze({ ...modifier.source }),
    stat: modifier.stat,
    operation: modifier.operation,
    amount: modifier.amount,
    priority: modifier.priority,
    stackingGroup: modifier.stackingGroup,
    stacking: modifier.stacking,
    ...(condition ? { condition } : {}),
    ...(modifier.startsAtTick === undefined ? {} : { startsAtTick }),
    ...(modifier.expiresAtTick === undefined
      ? {}
      : { expiresAtTick: modifier.expiresAtTick }),
  });
}

function isActive(
  modifier: AurionModifier,
  baseStats: Readonly<Record<string, number>>,
  logicalTick: number
): boolean {
  const startsAtTick = modifier.startsAtTick ?? 0;
  if (
    logicalTick < startsAtTick ||
    (modifier.expiresAtTick !== undefined &&
      logicalTick >= modifier.expiresAtTick)
  )
    return false;
  if (!modifier.condition) return true;
  const value = baseStats[modifier.condition.stat];
  if (value === undefined) return false;
  switch (modifier.condition.comparison) {
    case "gte":
      return value >= modifier.condition.value;
    case "lte":
      return value <= modifier.condition.value;
    case "eq":
      return value === modifier.condition.value;
  }
}

function compareModifier(left: AurionModifier, right: AurionModifier): number {
  return (
    left.priority - right.priority ||
    textCompare(left.stat, right.stat) ||
    textCompare(left.operation, right.operation) ||
    textCompare(left.stackingGroup, right.stackingGroup) ||
    textCompare(left.modifierId, right.modifierId)
  );
}

type ModifierGroup = Readonly<{
  stat: string;
  priority: number;
  operation: AurionModifierOperation;
  stackingGroup: string;
  stacking: AurionModifierStacking;
  modifiers: readonly AurionModifier[];
}>;

function groupModifiers(
  modifiers: readonly AurionModifier[]
): readonly ModifierGroup[] {
  const grouped = new Map<string, AurionModifier[]>();
  for (const modifier of modifiers) {
    const key = [
      modifier.stat,
      modifier.priority,
      modifier.operation,
      modifier.stackingGroup,
    ].join("\u001f");
    const current = grouped.get(key) ?? [];
    current.push(modifier);
    grouped.set(key, current);
  }
  return Object.freeze(
    Array.from(grouped.values())
      .map(group => {
        const sorted = group.slice().sort(compareModifier);
        const first = sorted[0]!;
        if (sorted.some(modifier => modifier.stacking !== first.stacking))
          throw new Error("AURION_MODIFIER_STACKING_GROUP_CONFLICT");
        return Object.freeze({
          stat: first.stat,
          priority: first.priority,
          operation: first.operation,
          stackingGroup: first.stackingGroup,
          stacking: first.stacking,
          modifiers: Object.freeze(sorted),
        });
      })
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          textCompare(left.stat, right.stat) ||
          textCompare(left.operation, right.operation) ||
          textCompare(left.stackingGroup, right.stackingGroup)
      )
  );
}

function resolveGroupAmount(group: ModifierGroup): number {
  const amounts = group.modifiers.map(modifier => modifier.amount);
  switch (group.stacking) {
    case "sum":
      return sum(amounts, "AURION_MODIFIER_GROUP_SUM_OVERFLOW");
    case "highest":
      return Math.max(...amounts);
    case "lowest":
      return Math.min(...amounts);
  }
}

export function resolveAurionDerivedStats(
  input: AurionDerivedStatsInput
): AurionDerivedStats {
  assertSafeInteger(input.logicalTick, "AURION_MODIFIER_LOGICAL_TICK_INVALID");
  if (input.logicalTick < 0)
    throw new Error("AURION_MODIFIER_LOGICAL_TICK_INVALID");
  const baseStats = canonicalStats(input.baseStats, "AURION_MODIFIER_BASE");
  if (input.modifiers.length > MAX_MODIFIERS)
    throw new Error("AURION_MODIFIER_TOO_MANY");
  const seen = new Set<string>();
  const canonical = input.modifiers.map(canonicalModifier);
  for (const modifier of canonical) {
    if (seen.has(modifier.modifierId))
      throw new Error("AURION_MODIFIER_ID_DUPLICATE");
    seen.add(modifier.modifierId);
  }
  const activeModifiers = Object.freeze(
    canonical
      .filter(modifier => isActive(modifier, baseStats, input.logicalTick))
      .sort(compareModifier)
  );
  const sourceSetHash = canonicalSha256({
    domain: "aurion.modifier.source-set.v1",
    rulesetVersion: AURION_MODIFIER_RULESET_VERSION,
    logicalTick: input.logicalTick,
    modifiers: activeModifiers,
  });
  const groups = groupModifiers(activeModifiers);
  const working = new Map<string, number>(Object.entries(baseStats));
  const priorities = Array.from(
    new Set(
      groups
        .filter(
          group => group.operation === "add" || group.operation === "scale_bps"
        )
        .map(group => group.priority)
    )
  ).sort((left, right) => left - right);

  for (const priority of priorities) {
    const byStat = new Map<string, { adds: number[]; scales: number[] }>();
    for (const group of groups.filter(
      candidate =>
        candidate.priority === priority &&
        (candidate.operation === "add" || candidate.operation === "scale_bps")
    )) {
      const values = byStat.get(group.stat) ?? { adds: [], scales: [] };
      (group.operation === "add" ? values.adds : values.scales).push(
        resolveGroupAmount(group)
      );
      byStat.set(group.stat, values);
    }
    for (const stat of Array.from(byStat.keys()).sort(textCompare)) {
      const values = byStat.get(stat)!;
      const additive = sum(values.adds, "AURION_MODIFIER_ADDITIVE_OVERFLOW");
      const scaleBps = sum(values.scales, "AURION_MODIFIER_SCALE_OVERFLOW");
      if (scaleBps < -BPS || scaleBps > MAX_TOTAL_SCALE_BPS)
        throw new Error("AURION_MODIFIER_SCALE_TOTAL_OUT_OF_RANGE");
      const beforeScale = safeNumber(
        BigInt(working.get(stat) ?? 0) + BigInt(additive),
        "AURION_MODIFIER_STAT_OVERFLOW"
      );
      const scaled = floorDivide(
        BigInt(beforeScale) * BigInt(BPS + scaleBps),
        BigInt(BPS)
      );
      working.set(stat, safeNumber(scaled, "AURION_MODIFIER_STAT_OVERFLOW"));
    }
  }

  const caps = new Map<string, { minimums: number[]; maximums: number[] }>();
  for (const group of groups.filter(
    candidate => candidate.operation === "min" || candidate.operation === "max"
  )) {
    const values = caps.get(group.stat) ?? { minimums: [], maximums: [] };
    (group.operation === "min" ? values.minimums : values.maximums).push(
      resolveGroupAmount(group)
    );
    caps.set(group.stat, values);
  }
  for (const stat of Array.from(caps.keys()).sort(textCompare)) {
    const values = caps.get(stat)!;
    const minimum = values.minimums.length
      ? Math.max(...values.minimums)
      : undefined;
    const maximum = values.maximums.length
      ? Math.min(...values.maximums)
      : undefined;
    if (minimum !== undefined && maximum !== undefined && minimum > maximum)
      throw new Error("AURION_MODIFIER_CAP_CONFLICT");
    const current = working.get(stat) ?? 0;
    const raised = minimum === undefined ? current : Math.max(minimum, current);
    working.set(
      stat,
      maximum === undefined ? raised : Math.min(maximum, raised)
    );
  }

  const stats = canonicalStats(
    Object.fromEntries(
      Array.from(working.entries()).sort(([left], [right]) =>
        textCompare(left, right)
      )
    ),
    "AURION_MODIFIER_DERIVED"
  );
  const derivedStatsHash = canonicalSha256({
    domain: "aurion.modifier.derived-stats.v1",
    rulesetVersion: AURION_MODIFIER_RULESET_VERSION,
    logicalTick: input.logicalTick,
    baseStats,
    sourceSetHash,
    stats,
  });
  return Object.freeze({
    rulesetVersion: AURION_MODIFIER_RULESET_VERSION,
    logicalTick: input.logicalTick,
    stats,
    activeModifiers,
    sourceSetHash,
    derivedStatsHash,
  });
}
