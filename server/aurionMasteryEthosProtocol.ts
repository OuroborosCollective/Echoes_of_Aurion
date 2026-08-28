import { createHash } from "node:crypto";
import { advanceExactSkillProgression, type ExactProgression } from "./wasdAurionSkillProgressionProtocol";

export const AURION_MASTERY_RULESET_VERSION = "aurion-mastery-ethos.v1" as const;
export const aurionMasteryDisciplineIds = [
  "blade_mastery", "staff_mastery", "spear_mastery", "focus_mastery", "axe_mastery", "mace_mastery", "dagger_mastery", "bow_mastery", "shield_mastery",
  "light_armor_mastery", "medium_armor_mastery", "heavy_armor_mastery", "ward_armor_mastery",
  "ember_magic", "tide_magic", "gale_magic", "stone_magic", "resonance_magic", "restoration_magic",
  "woodworking", "smithing", "weaving", "alchemy", "rune_crafting", "shaping",
  "council", "administration", "sovereignty", "diplomacy", "stewardship",
] as const;
export type AurionMasteryDisciplineId = (typeof aurionMasteryDisciplineIds)[number];
export const aurionMasterySources = ["encounter", "quest", "crafting", "shaping", "civic", "diplomacy", "world_stewardship"] as const;
export type AurionMasterySource = (typeof aurionMasterySources)[number];

export type MasteryProgressionEvent = Readonly<{
  idempotencyKey: string;
  sourceReceiptId: string;
  disciplineId: AurionMasteryDisciplineId;
  source: AurionMasterySource;
  amountExact: string;
  resolutionIndex: number;
  ruleSetVersion: string;
  contentVersion: string;
}>;
export type MasteryReadmodel = Readonly<{
  playerId: string;
  disciplineId: AurionMasteryDisciplineId;
  progression: ExactProgression;
  appliedReceiptIds: readonly string[];
  receiptHash: string;
}>;

export const aurionEthosAxes = ["mercy", "stewardship", "integrity"] as const;
export type AurionEthosAxis = (typeof aurionEthosAxes)[number];
export type EthosEvent = Readonly<{
  idempotencyKey: string;
  sourceReceiptId: string;
  deltasBps: Readonly<Partial<Record<AurionEthosAxis, number>>>;
  resolutionIndex: number;
  ruleSetVersion: string;
  contentVersion: string;
}>;
export type EthosAuraReadmodel = Readonly<{
  playerId: string;
  axesBps: Readonly<Record<AurionEthosAxis, number>>;
  alignment: "good" | "neutral" | "evil";
  aura: "dormant" | "radiant" | "shadow";
  trigger: "none" | "threshold" | "extreme_shift";
  appliedReceiptIds: readonly string[];
  receiptHash: string;
}>;
export type CivicStanding = Readonly<{
  councilRank: "observer" | "delegate" | "councillor" | "steward";
  administrationRank: "apprentice" | "clerk" | "administrator" | "chancellor";
  diplomacyRank: "envoy" | "mediator" | "ambassador" | "accord_keeper";
  sovereigntyRank: "aspirant" | "warden" | "regent" | "sovereign";
}>;

const textCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const hash = (...parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const zeroProgression = (): ExactProgression => ({ totalXpExact: "0", levelExact: "1", xpIntoLevelExact: "0", xpForNextLevelExact: "50", totalXp: 0, level: 1, numberProjectionExact: true });

function assertDiscipline(value: string): asserts value is AurionMasteryDisciplineId {
  if (!(aurionMasteryDisciplineIds as readonly string[]).includes(value)) throw new Error("unknown Aurion mastery discipline");
}

function stableMasteryEvents(events: readonly MasteryProgressionEvent[], disciplineId: AurionMasteryDisciplineId): readonly MasteryProgressionEvent[] {
  const seen = new Set<string>();
  return events
    .filter(event => event.disciplineId === disciplineId)
    .slice()
    .sort((left, right) => left.resolutionIndex - right.resolutionIndex || textCompare(left.sourceReceiptId, right.sourceReceiptId) || textCompare(left.idempotencyKey, right.idempotencyKey))
    .filter(event => {
      if (!event.idempotencyKey || !event.sourceReceiptId || !event.ruleSetVersion || !event.contentVersion || !Number.isSafeInteger(event.resolutionIndex) || event.resolutionIndex < 0) return false;
      if (seen.has(event.idempotencyKey)) return false;
      seen.add(event.idempotencyKey);
      return true;
    });
}

export function resolveMasteryReadmodel(input: Readonly<{ playerId: string; disciplineId: AurionMasteryDisciplineId; events: readonly MasteryProgressionEvent[]; current?: Pick<ExactProgression, "totalXpExact" | "levelExact" | "xpIntoLevelExact"> }>): MasteryReadmodel {
  if (!input.playerId) throw new Error("mastery requires a player ID");
  assertDiscipline(input.disciplineId);
  const accepted = stableMasteryEvents(input.events, input.disciplineId);
  let progression = input.current ? advanceExactSkillProgression(input.current, "0") : zeroProgression();
  for (const event of accepted) progression = advanceExactSkillProgression(progression, event.amountExact);
  const appliedReceiptIds = Object.freeze(accepted.map(event => event.sourceReceiptId));
  return Object.freeze({
    playerId: input.playerId,
    disciplineId: input.disciplineId,
    progression,
    appliedReceiptIds,
    receiptHash: hash(AURION_MASTERY_RULESET_VERSION, input.playerId, input.disciplineId, ...accepted.map(event => `${event.resolutionIndex}:${event.sourceReceiptId}:${event.idempotencyKey}:${event.amountExact}:${event.ruleSetVersion}:${event.contentVersion}`)),
  });
}

function clampEthos(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("ethos delta must be a safe integer");
  return Math.max(-2_500, Math.min(2_500, value));
}

function initialEthos(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value)) throw new Error("ethos state must be a safe integer");
  return Math.max(-10_000, Math.min(10_000, value));
}

function stableEthosDeltaText(deltas: Readonly<Partial<Record<AurionEthosAxis, number>>>): string {
  return aurionEthosAxes.map(axis => `${axis}:${deltas[axis] ?? 0}`).join("|");
}

function stableEthosEvents(events: readonly EthosEvent[]): readonly EthosEvent[] {
  const seen = new Set<string>();
  return events.slice()
    .sort((left, right) => left.resolutionIndex - right.resolutionIndex || textCompare(left.sourceReceiptId, right.sourceReceiptId) || textCompare(left.idempotencyKey, right.idempotencyKey))
    .filter(event => {
      if (!event.idempotencyKey || !event.sourceReceiptId || !event.ruleSetVersion || !event.contentVersion || !Number.isSafeInteger(event.resolutionIndex) || event.resolutionIndex < 0 || seen.has(event.idempotencyKey)) return false;
      seen.add(event.idempotencyKey);
      return true;
    });
}

export function resolveEthosAura(input: Readonly<{ playerId: string; events: readonly EthosEvent[]; current?: Partial<Record<AurionEthosAxis, number>> }>): EthosAuraReadmodel {
  if (!input.playerId) throw new Error("ethos requires a player ID");
  const axes: Record<AurionEthosAxis, number> = {
    mercy: initialEthos(input.current?.mercy),
    stewardship: initialEthos(input.current?.stewardship),
    integrity: initialEthos(input.current?.integrity),
  };
  const accepted = stableEthosEvents(input.events);
  let extremeShift = false;
  for (const event of accepted) {
    const magnitudes = aurionEthosAxes.map(axis => {
      const delta = event.deltasBps[axis] ?? 0;
      const normalized = clampEthos(delta);
      axes[axis] = Math.max(-10_000, Math.min(10_000, axes[axis] + normalized));
      return Math.abs(normalized);
    });
    if (Math.max(...magnitudes) >= 2_000) extremeShift = true;
  }
  const composite = Math.round((axes.mercy * 4 + axes.stewardship * 3 + axes.integrity * 3) / 10);
  const alignment: EthosAuraReadmodel["alignment"] = composite >= 2_500 ? "good" : composite <= -2_500 ? "evil" : "neutral";
  const aura: EthosAuraReadmodel["aura"] = composite >= 6_000 || (extremeShift && composite >= 2_500)
    ? "radiant"
    : composite <= -6_000 || (extremeShift && composite <= -2_500)
      ? "shadow"
      : "dormant";
  const trigger: EthosAuraReadmodel["trigger"] = aura !== "dormant" ? (extremeShift ? "extreme_shift" : "threshold") : "none";
  return Object.freeze({
    playerId: input.playerId,
    axesBps: Object.freeze({ ...axes }),
    alignment,
    aura,
    trigger,
    appliedReceiptIds: Object.freeze(accepted.map(event => event.sourceReceiptId)),
    receiptHash: hash(AURION_MASTERY_RULESET_VERSION, input.playerId, String(axes.mercy), String(axes.stewardship), String(axes.integrity), alignment, aura, trigger, ...accepted.map(event => `${event.resolutionIndex}:${event.sourceReceiptId}:${event.idempotencyKey}:${stableEthosDeltaText(event.deltasBps)}`)),
  });
}

function rank(levelExact: string, labels: readonly [string, string, string, string]): string {
  const level = BigInt(levelExact);
  if (level >= BigInt(500)) return labels[3];
  if (level >= BigInt(100)) return labels[2];
  if (level >= BigInt(25)) return labels[1];
  return labels[0];
}

/** Civic standing is a visible readmodel. Authorization remains a separate server-side policy. */
export function resolveCivicStanding(input: Readonly<{ council: MasteryReadmodel; administration: MasteryReadmodel; diplomacy: MasteryReadmodel; sovereignty: MasteryReadmodel }>): CivicStanding {
  if (input.council.disciplineId !== "council" || input.administration.disciplineId !== "administration" || input.diplomacy.disciplineId !== "diplomacy" || input.sovereignty.disciplineId !== "sovereignty") throw new Error("civic standing requires matching mastery disciplines");
  return Object.freeze({
    councilRank: rank(input.council.progression.levelExact, ["observer", "delegate", "councillor", "steward"]) as CivicStanding["councilRank"],
    administrationRank: rank(input.administration.progression.levelExact, ["apprentice", "clerk", "administrator", "chancellor"]) as CivicStanding["administrationRank"],
    diplomacyRank: rank(input.diplomacy.progression.levelExact, ["envoy", "mediator", "ambassador", "accord_keeper"]) as CivicStanding["diplomacyRank"],
    sovereigntyRank: rank(input.sovereignty.progression.levelExact, ["aspirant", "warden", "regent", "sovereign"]) as CivicStanding["sovereigntyRank"],
  });
}
