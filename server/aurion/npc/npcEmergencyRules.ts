// Native Aurion NPC emergency rules — fixed rules for extreme resource scarcity.
// When NPCs face critical shortages they automatically:
//   1. Request aid from trade guilds
//   2. Ration remaining supplies
//   3. As a last resort, raid — prioritising targets with the worst historical
//      negative memory evaluations (murderers, thieves, corrupt kings,
//      dangerous players, NPC killers).
// All hash identifiers use "aurion:" prefixes — no legacy dependencies.

import { createHash } from "node:crypto";
import type { HubId, CommodityId, MarketState } from "./ax1LivingWorldProtocol.js";
import { marketPriceCopper } from "./ax1LivingWorldProtocol.js";
import type { NpcNeedState, NpcNeedKey } from "./npcNeeds.js";
import type { NpcPersonality } from "./npcLifeProtocol.js";
import type { NpcStateSummary, NpcEnvironment } from "./npcMarketReaction.js";

// ═══════════════════════════════════════════════════════════════════════════
//  EMERGENCY THRESHOLDS — fixed, deterministic constants
// ═══════════════════════════════════════════════════════════════════════════

/** Resource need value below which an NPC enters CRITICAL emergency (0..1). */
export const CRITICAL_RESOURCE_THRESHOLD = 0.15;

/** Resource need value below which an NPC enters SEVERE emergency (0..1). */
export const SEVERE_RESOURCE_THRESHOLD = 0.30;

/** Wealth in copper below which an NPC cannot buy food and enters emergency. */
export const EMERGENCY_WEALTH_COPPER = 100;

/** Stock ratio (current/initial) below which a hub-wide scarcity emergency triggers. */
export const HUB_SCARCITY_STOCK_RATIO = 0.20;

/** Rationing factor — NPCs consume only this fraction of normal intake. */
export const RATIONING_FACTOR = 0.5;

/** Minimum negative-memory score for a target to be prioritised for raiding (0..10000 bps). */
export const RAID_MIN_NEGATIVITY_BPS = 5_000;

/** Maximum number of raid targets considered per evaluation. */
export const MAX_RAID_CANDIDATES = 8;

/** How many ticks an emergency declaration stays active before re-evaluation. */
export const EMERGENCY_COOLDOWN_TICKS = 10;

// ═══════════════════════════════════════════════════════════════════════════
//  NEGATIVE MEMORY EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/** Categories of negative historical behaviour that mark a target for raiding. */
export type NegativeMemoryCategory =
  | "murder"
  | "theft"
  | "corrupt_authority"
  | "dangerous_player"
  | "npc_killer"
  | "general_hostility";

/** A historical negative memory record about a specific actor or entity. */
export type NegativeMemoryRecord = Readonly<{
  /** The entity the memory is about (the potential raid target). */
  targetId: string;
  /** Category of the negative act. */
  category: NegativeMemoryCategory;
  /** Severity in bps (0..10000). */
  severityBps: number;
  /** How recent the event was (resolution index when it happened). */
  recordedAtResolutionIndex: number;
  /** Whether the memory is confirmed via action receipt. */
  confirmed: boolean;
}>;

/** Weight per category — worse crimes score higher. */
const categoryWeights: Readonly<Record<NegativeMemoryCategory, number>> = Object.freeze({
  murder: 1.0,
  npc_killer: 0.95,
  corrupt_authority: 0.80,
  dangerous_player: 0.75,
  theft: 0.60,
  general_hostility: 0.40,
});

/**
 * Computes a deterministic negativity score (0..10000 bps) for a target
 * based on all historical negative memory records about them.
 *
 * The score weights by category severity, confirmation status, and recency.
 * Recent confirmed murders and NPC killings score highest.
 */
export function computeNegativityScore(
  records: readonly NegativeMemoryRecord[],
  currentResolutionIndex: number,
): number {
  if (records.length === 0) return 0;

  let total = 0;
  for (const record of records) {
    const weight = categoryWeights[record.category];
    const confirmedBonus = record.confirmed ? 1.0 : 0.6;
    const age = Math.max(0, currentResolutionIndex - record.recordedAtResolutionIndex);
    // Recency decay: full weight for recent events, 50% after 1000 ticks, 25% after 2000
    const recencyFactor = Math.max(0.25, 1.0 - Math.floor(age / 1000) * 0.25);
    total += record.severityBps * weight * confirmedBonus * recencyFactor;
  }

  // Diminishing returns: cap and normalise
  return Math.min(10_000, Math.round(total / Math.max(1, records.length) + total * 0.1));
}

/**
 * Ranks potential raid targets by negativity score, returning the worst offenders first.
 * Only targets above RAID_MIN_NEGATIVITY_BPS are included.
 */
export function rankRaidTargets(
  input: Readonly<{
    memoriesByTarget: Readonly<Record<string, readonly NegativeMemoryRecord[]>>;
    currentResolutionIndex: number;
    maxCandidates?: number;
  }>,
): readonly RaidTarget[] {
  const max = input.maxCandidates ?? MAX_RAID_CANDIDATES;
  const targets: RaidTarget[] = [];

  for (const [targetId, records] of Object.entries(input.memoriesByTarget)) {
    const score = computeNegativityScore(records, input.currentResolutionIndex);
    if (score < RAID_MIN_NEGATIVITY_BPS) continue;

    // Determine the worst category for this target
    const worstCategory = records
      .slice()
      .sort((a, b) => categoryWeights[b.category] - categoryWeights[a.category] || b.severityBps - a.severityBps)[0]
      ?.category ?? "general_hostility";

    targets.push({
      targetId,
      negativityScoreBps: score,
      worstCategory,
      recordCount: records.length,
      receiptHash: hash([
        "aurion:raid-target:v1",
        targetId,
        String(score),
        worstCategory,
        String(records.length),
      ]),
    });
  }

  // Sort: highest negativity first, then most records, then deterministic by ID
  targets.sort((a, b) =>
    b.negativityScoreBps - a.negativityScoreBps
    || b.recordCount - a.recordCount
    || a.targetId.localeCompare(b.targetId),
  );

  return Object.freeze(targets.slice(0, max));
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMERGENCY LEVEL & ACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type EmergencyLevel = "none" | "severe" | "critical";

export type EmergencyAction =
  | "request_guild_aid"
  | "ration_supplies"
  | "raid_prioritised_target"
  | "flee_emergency";

export type RaidTarget = Readonly<{
  targetId: string;
  negativityScoreBps: number;
  worstCategory: NegativeMemoryCategory;
  recordCount: number;
  receiptHash: string;
}>;

export type EmergencyDirective = Readonly<{
  npcId: string;
  level: EmergencyLevel;
  action: EmergencyAction;
  reason: string;
  /** Target hub for guild aid request or raid. */
  targetHubId: HubId | null;
  /** Target entity for raiding (if action is raid). */
  raidTargetId: string | null;
  /** Rationing factor if action is ration_supplies. */
  rationingFactor: number;
  /** Urgency in bps (0..10000). */
  urgencyBps: number;
  /** Cooldown ticks before re-evaluation. */
  cooldownTicks: number;
  receiptHash: string;
}>;

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function hash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function clampBps(value: number, min = 0, max = 10_000): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function defaultPersonality(): NpcPersonality {
  return { empathyBps: 5000, courageBps: 5000, curiosityBps: 5000, loyaltyBps: 5000, ambitionBps: 5000, prudenceBps: 5000 };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMERGENCY DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determines the emergency level for an NPC based on its needs, wealth, and
 * the market conditions at its hub.
 *
 * The escalation ladder is fixed and deterministic:
 *   - none      → no action needed
 *   - severe    → request guild aid + ration supplies
 *   - critical  → raid prioritised targets (worst historical offenders first)
 */
export function detectEmergencyLevel(input: Readonly<{
  needs: NpcNeedState;
  wealthCopper: number;
  market: MarketState;
  initialStock: Readonly<Record<CommodityId, number>>;
}>): EmergencyLevel {
  const resourceNeed = input.needs.resources;
  const grainStock = input.market.stock.grain;
  const grainInitial = input.initialStock.grain ?? grainStock;
  const stockRatio = grainInitial > 0 ? grainStock / grainInitial : 1;

  // Critical: resource need below threshold AND cannot afford to buy
  if (resourceNeed <= CRITICAL_RESOURCE_THRESHOLD && input.wealthCopper < EMERGENCY_WEALTH_COPPER) {
    return "critical";
  }

  // Critical: hub-wide grain scarcity
  if (stockRatio <= HUB_SCARCITY_STOCK_RATIO && resourceNeed <= SEVERE_RESOURCE_THRESHOLD) {
    return "critical";
  }

  // Severe: resource need below severe threshold
  if (resourceNeed <= SEVERE_RESOURCE_THRESHOLD) {
    return "severe";
  }

  // Severe: very low wealth with moderate resource pressure
  if (input.wealthCopper < EMERGENCY_WEALTH_COPPER && resourceNeed <= 0.50) {
    return "severe";
  }

  return "none";
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMERGENCY RESPONSE — deterministic action selection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluates the emergency response for an NPC.
 *
 * Fixed rules (in priority order):
 *   1. SEVERE: Request guild aid + ration supplies.
 *   2. CRITICAL: If raid targets with sufficient negativity exist, raid the
 *      worst offender. Otherwise, request guild aid and ration.
 *   3. If war pressure is extreme and no raid targets, flee.
 *
 * Raid target selection is based purely on historical negative memory
 * evaluations — murderers, thieves, corrupt kings, dangerous players, and
 * NPC killers are prioritised from worst to least bad.
 */
export function evaluateEmergencyResponse(input: Readonly<{
  npcId: string;
  summary: NpcStateSummary;
  needs: NpcNeedState;
  market: MarketState;
  initialStock: Readonly<Record<CommodityId, number>>;
  personality?: NpcPersonality;
  currentResolutionIndex: number;
  memoriesByTarget?: Readonly<Record<string, readonly NegativeMemoryRecord[]>>;
  lastEmergencyTick?: number;
}>): EmergencyDirective {
  const p = input.personality ?? defaultPersonality();
  const level = detectEmergencyLevel({
    needs: input.needs,
    wealthCopper: input.summary.wealthCopper,
    market: input.market,
    initialStock: input.initialStock,
  });

  // No emergency — return a no-op directive
  if (level === "none") {
    return makeDirective(
      input.npcId, "none", "request_guild_aid",
      "no emergency detected", null, null, 1.0, 0, 0,
    );
  }

  // Cooldown check: if we recently declared an emergency, don't re-evaluate
  const lastTick = input.lastEmergencyTick ?? -Infinity;
  if (input.currentResolutionIndex - lastTick < EMERGENCY_COOLDOWN_TICKS) {
    return makeDirective(
      input.npcId, level, "ration_supplies",
      `emergency cooldown (${input.currentResolutionIndex - lastTick}/${EMERGENCY_COOLDOWN_TICKS} ticks)`,
      null, null, RATIONING_FACTOR, 0, EMERGENCY_COOLDOWN_TICKS - (input.currentResolutionIndex - lastTick),
    );
  }

  const env = input.summary.environment;
  const urgencyBps = clampBps(
    level === "critical" ? 10_000
    : level === "severe" ? 7_000
    : 0,
  );

  // ── CRITICAL: attempt raid on worst historical offender ──
  if (level === "critical") {
    const raidTargets = rankRaidTargets({
      memoriesByTarget: input.memoriesByTarget ?? {},
      currentResolutionIndex: input.currentResolutionIndex,
    });

    if (raidTargets.length > 0) {
      // Courage increases willingness to raid; prudence decreases it
      const courageBonus = p.courageBps / 10_000;
      const prudencePenalty = p.prudenceBps / 10_000;
      const raidUrgency = clampBps(urgencyBps * (0.7 + courageBonus * 0.3 + (1 - prudencePenalty) * 0.2));

      const best = raidTargets[0]!;
      const reason = `raid ${best.targetId} (negativity=${(best.negativityScoreBps / 100).toFixed(0)}%, category=${best.worstCategory}, records=${best.recordCount})`;

      return makeDirective(
        input.npcId, "critical", "raid_prioritised_target",
        reason, env.hubId, best.targetId, 1.0, raidUrgency, EMERGENCY_COOLDOWN_TICKS,
      );
    }

    // No viable raid targets — flee if war pressure is extreme
    if (env.warPressure > 0.7) {
      return makeDirective(
        input.npcId, "critical", "flee_emergency",
        `flee: no raid targets, war pressure ${(env.warPressure * 100).toFixed(0)}%`,
        env.hubId, null, 1.0, urgencyBps, EMERGENCY_COOLDOWN_TICKS,
      );
    }

    // Fall through to severe-level actions
  }

  // ── SEVERE (or CRITICAL with no raid targets): request guild aid + ration ──
  const grainPrice = marketPriceCopper({
    commodity: "grain",
    stock: input.market.stock.grain,
    demandBps: 5_000,
    taxRateBasisPoints: input.market.taxRateBasisPoints,
  });
  const aidUrgency = clampBps(urgencyBps * 0.8 + (input.summary.hungerBps * 0.2));

  const reason = level === "critical"
    ? `critical scarcity: grain at ${input.market.stock.grain} (price ${grainPrice}c), wealth ${input.summary.wealthCopper}c — request guild aid and ration`
    : `severe scarcity: resources at ${(input.needs.resources * 100).toFixed(0)}% — request guild aid and ration`;

  return makeDirective(
    input.npcId, level, "request_guild_aid",
    reason, env.hubId, null, RATIONING_FACTOR, aidUrgency, EMERGENCY_COOLDOWN_TICKS,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BATCH EMERGENCY EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

export type EmergencyBatchInput = Readonly<{
  summaries: Readonly<Record<HubId, NpcStateSummary>>;
  needs: Readonly<Record<HubId, NpcNeedState>>;
  markets: Readonly<Record<HubId, MarketState>>;
  initialStock: Readonly<Record<HubId, Readonly<Record<CommodityId, number>>>>;
  personalities?: Readonly<Record<string, NpcPersonality>>;
  currentResolutionIndex: number;
  memoriesByTargetByNpc?: Readonly<Record<string, Readonly<Record<string, readonly NegativeMemoryRecord[]>>>>;
  lastEmergencyTickByNpc?: Readonly<Record<string, number>>;
}>;

export type EmergencyBatchResult = Readonly<{
  directives: readonly EmergencyDirective[];
  resolutionIndex: number;
  summary: string;
}>;

const ALL_HUBS: HubId[] = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];

/**
 * Evaluates emergency responses for all NPCs across all hubs in a single tick.
 * Returns directives sorted by urgency (highest first).
 */
export function evaluateAllEmergencies(input: EmergencyBatchInput): EmergencyBatchResult {
  const directives: EmergencyDirective[] = [];

  for (const hub of ALL_HUBS) {
    const summary = input.summaries[hub];
    const needs = input.needs[hub];
    const market = input.markets[hub];
    if (!summary || !needs || !market) continue;

    const directive = evaluateEmergencyResponse({
      npcId: summary.npcId,
      summary,
      needs,
      market,
      initialStock: input.initialStock[hub] ?? {},
      personality: input.personalities?.[summary.npcId],
      currentResolutionIndex: input.currentResolutionIndex,
      memoriesByTarget: input.memoriesByTargetByNpc?.[summary.npcId] ?? {},
      lastEmergencyTick: input.lastEmergencyTickByNpc?.[summary.npcId],
    });

    if (directive.level !== "none") {
      directives.push(directive);
    }
  }

  directives.sort((a, b) => b.urgencyBps - a.urgencyBps);

  const summary = `Tick ${input.currentResolutionIndex}: ${directives.length} emergency directive(s) — ` +
    directives.map(d => `${d.npcId}:${d.action}`).join(", ");

  return Object.freeze({
    directives: Object.freeze(directives),
    resolutionIndex: input.currentResolutionIndex,
    summary,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  DIRECTIVE CONSTRUCTOR
// ═══════════════════════════════════════════════════════════════════════════

function makeDirective(
  npcId: string,
  level: EmergencyLevel,
  action: EmergencyAction,
  reason: string,
  targetHubId: HubId | null,
  raidTargetId: string | null,
  rationingFactor: number,
  urgencyBps: number,
  cooldownTicks: number,
): EmergencyDirective {
  const receiptHash = hash([
    "aurion:npc-emergency:v1",
    npcId,
    level,
    action,
    reason,
    targetHubId ?? "none",
    raidTargetId ?? "none",
    String(rationingFactor),
    String(urgencyBps),
    String(cooldownTicks),
  ]);

  return Object.freeze({
    npcId,
    level,
    action,
    reason,
    targetHubId,
    raidTargetId,
    rationingFactor,
    urgencyBps: clampBps(urgencyBps),
    cooldownTicks,
    receiptHash,
  });
}
