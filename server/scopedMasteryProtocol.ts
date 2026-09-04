import { createHash } from "node:crypto";
import { advanceExactSkillProgression, type ExactProgression } from "./wasdAurionSkillProgressionProtocol";

export const SCOPED_MASTERY_RULESET_VERSION = "aurion-scoped-mastery.v1" as const;
export const masteryScopeTypes = [
  "profession", "recipe", "item", "weapon", "action", "social",
  "npc_relation", "faction", "politics", "navigation", "gathering", "combat",
] as const;
export type MasteryScopeType = (typeof masteryScopeTypes)[number];

export type ScopedMasteryKey = Readonly<{
  version: 1;
  scopeType: MasteryScopeType;
  scopeId: string;
}>;

export type MasteryContextMetrics = Readonly<Record<string, string>>;
export type AppliedMasteryEvent = Readonly<{
  eventKey: string;
  eventDigest: string;
  receiptId: string;
  idempotencyKey: string;
  resolutionIndex: number;
}>;
export type ScopedMasteryState = Readonly<{
  actorId: string;
  key: ScopedMasteryKey;
  progression: ExactProgression;
  lifetimeUsesExact: string;
  qualityScoreExact: string;
  contextMetricsExact: MasteryContextMetrics;
  appliedReceiptIds: readonly string[];
  appliedEvents: readonly AppliedMasteryEvent[];
  stateHash: string;
}>;

export type ScopedMasteryEvent = Readonly<{
  receiptId: string;
  idempotencyKey: string;
  resolutionIndex: number;
  key: ScopedMasteryKey;
  amountExact: string;
  useCountExact?: string;
  qualityDeltaExact?: string;
  contextMetricsExact?: MasteryContextMetrics;
  serverValidated: boolean;
  activeDurationTicks: number;
  repetitionStreak: number;
  distinctContextCount: number;
  ruleSetVersion: string;
  contentVersion: string;
}>;

const zeroProgression = (): ExactProgression => ({
  totalXpExact: "0",
  levelExact: "1",
  xpIntoLevelExact: "0",
  xpForNextLevelExact: "50",
  totalXp: 0,
  level: 1,
  numberProjectionExact: true,
});
const exact = (value: string, field: string): bigint => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${field} must be a canonical non-negative decimal`);
  return BigInt(value);
};
const safeId = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const safeToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const hash = (parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const masteryEventKey = (receiptId: string, idempotencyKey: string): string => `${receiptId}\u001e${idempotencyKey}`;

export function scopedMasteryKey(scopeType: MasteryScopeType, scopeId: string): ScopedMasteryKey {
  if (!(masteryScopeTypes as readonly string[]).includes(scopeType) || !safeId.test(scopeId)) throw new Error("invalid mastery scope");
  return Object.freeze({ version: 1, scopeType, scopeId });
}

export function canonicalScopedMasteryKey(key: ScopedMasteryKey): string {
  const canonical = scopedMasteryKey(key.scopeType, key.scopeId);
  return `v${canonical.version}:${canonical.scopeType}:${canonical.scopeId}`;
}

export const masteryKeys = Object.freeze({
  profession: (id: string) => scopedMasteryKey("profession", id),
  recipe: (id: string) => scopedMasteryKey("recipe", id),
  item: (id: string) => scopedMasteryKey("item", id),
  weapon: (id: string) => scopedMasteryKey("weapon", id),
  action: (id: string) => scopedMasteryKey("action", id),
  social: (id: string) => scopedMasteryKey("social", id),
  npcRelation: (id: string) => scopedMasteryKey("npc_relation", id),
  faction: (id: string) => scopedMasteryKey("faction", id),
  politics: (id: string) => scopedMasteryKey("politics", id),
  navigation: (id: string) => scopedMasteryKey("navigation", id),
  gathering: (id: string) => scopedMasteryKey("gathering", id),
  combat: (id: string) => scopedMasteryKey("combat", id),
});

export type MasteryEligibility = Readonly<{
  eligible: boolean;
  effectiveAmountExact: string;
  diminishingBps: number;
  reason: "accepted" | "unvalidated" | "inactive" | "spam";
}>;

/**
 * Anti-spam/anti-AFK gate. It never mints XP: it only reduces a server-confirmed
 * amount. Repetition can approach 10% yield but never becomes negative.
 */
export function evaluateMasteryEligibility(event: ScopedMasteryEvent): MasteryEligibility {
  const amount = exact(event.amountExact, "amountExact");
  if (!event.serverValidated) return Object.freeze({ eligible: false, effectiveAmountExact: "0", diminishingBps: 0, reason: "unvalidated" });
  if (!Number.isSafeInteger(event.activeDurationTicks) || event.activeDurationTicks < 1) return Object.freeze({ eligible: false, effectiveAmountExact: "0", diminishingBps: 0, reason: "inactive" });
  if (!Number.isSafeInteger(event.repetitionStreak) || event.repetitionStreak < 0 || !Number.isSafeInteger(event.distinctContextCount) || event.distinctContextCount < 0) throw new Error("invalid mastery eligibility metrics");
  if (event.repetitionStreak >= 500 && event.distinctContextCount === 0) return Object.freeze({ eligible: false, effectiveAmountExact: "0", diminishingBps: 0, reason: "spam" });
  const repetitionPenalty = Math.min(9000, Math.floor(event.repetitionStreak / 10) * 250);
  const contextRecovery = Math.min(2500, event.distinctContextCount * 250);
  const diminishingBps = Math.max(1000, Math.min(10_000, 10_000 - repetitionPenalty + contextRecovery));
  const effective = amount * BigInt(diminishingBps) / 10_000n;
  return Object.freeze({ eligible: true, effectiveAmountExact: effective.toString(10), diminishingBps, reason: "accepted" });
}

function canonicalMetrics(metrics: MasteryContextMetrics | undefined): MasteryContextMetrics {
  const entries = Object.entries(metrics ?? {}).sort(([left], [right]) => compareText(left, right));
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!safeId.test(key)) throw new Error("invalid mastery context metric key");
    result[key] = exact(value, `context:${key}`).toString(10);
  }
  return Object.freeze(result);
}

function mergeMetrics(current: MasteryContextMetrics, delta: MasteryContextMetrics | undefined): MasteryContextMetrics {
  const next: Record<string, string> = { ...current };
  for (const [key, value] of Object.entries(canonicalMetrics(delta))) {
    next[key] = (exact(next[key] ?? "0", `context:${key}`) + exact(value, `context:${key}`)).toString(10);
  }
  return canonicalMetrics(next);
}

function canonicalProgression(current: Pick<ExactProgression, "totalXpExact" | "levelExact" | "xpIntoLevelExact"> | undefined): ExactProgression {
  return current ? advanceExactSkillProgression(current, "0") : zeroProgression();
}

function assertEventIdentity(event: ScopedMasteryEvent): void {
  if (!safeToken.test(event.receiptId) || !safeToken.test(event.idempotencyKey) || !safeToken.test(event.contentVersion)) throw new Error("invalid mastery event identity");
  if (!Number.isSafeInteger(event.resolutionIndex) || event.resolutionIndex < 0) throw new Error("invalid mastery resolutionIndex");
}

function canonicalAppliedEvents(events: readonly AppliedMasteryEvent[] | undefined): readonly AppliedMasteryEvent[] {
  const byKey = new Map<string, AppliedMasteryEvent>();
  for (const event of events ?? []) {
    if (!safeToken.test(event.receiptId) || !safeToken.test(event.idempotencyKey) || !digestPattern.test(event.eventDigest) || !Number.isSafeInteger(event.resolutionIndex) || event.resolutionIndex < 0) throw new Error("invalid applied mastery event");
    const expectedKey = masteryEventKey(event.receiptId, event.idempotencyKey);
    if (event.eventKey !== expectedKey) throw new Error("invalid applied mastery event key");
    const prior = byKey.get(event.eventKey);
    if (prior && prior.eventDigest !== event.eventDigest) throw new Error("MASTERY_IDEMPOTENCY_CONFLICT");
    byKey.set(event.eventKey, Object.freeze({ ...event }));
  }
  return Object.freeze(Array.from(byKey.values()).sort((left, right) => compareText(left.eventKey, right.eventKey)));
}

function masteryEventDigest(event: ScopedMasteryEvent, eligibility: MasteryEligibility): string {
  const metrics = canonicalMetrics(event.contextMetricsExact);
  return hash([
    SCOPED_MASTERY_RULESET_VERSION,
    event.contentVersion,
    canonicalScopedMasteryKey(event.key),
    event.receiptId,
    event.idempotencyKey,
    String(event.resolutionIndex),
    event.amountExact,
    eligibility.effectiveAmountExact,
    String(eligibility.diminishingBps),
    event.useCountExact ?? "1",
    event.qualityDeltaExact ?? "0",
    String(event.activeDurationTicks),
    String(event.repetitionStreak),
    String(event.distinctContextCount),
    ...Object.entries(metrics).map(([key, value]) => `${key}:${value}`),
  ]);
}

export function resolveScopedMastery(input: Readonly<{
  actorId: string;
  key: ScopedMasteryKey;
  current?: Pick<ScopedMasteryState, "progression" | "lifetimeUsesExact" | "qualityScoreExact" | "contextMetricsExact" | "appliedEvents"> & Partial<Pick<ScopedMasteryState, "actorId" | "key">>;
  events: readonly ScopedMasteryEvent[];
}>): ScopedMasteryState {
  if (!safeId.test(input.actorId)) throw new Error("invalid mastery actorId");
  const keyText = canonicalScopedMasteryKey(input.key);
  if (input.current?.actorId && input.current.actorId !== input.actorId) throw new Error("mastery current actor mismatch");
  if (input.current?.key && canonicalScopedMasteryKey(input.current.key) !== keyText) throw new Error("mastery current scope mismatch");

  let progression = canonicalProgression(input.current?.progression);
  let lifetimeUses = exact(input.current?.lifetimeUsesExact ?? "0", "lifetimeUsesExact");
  let qualityScore = exact(input.current?.qualityScoreExact ?? "0", "qualityScoreExact");
  let contextMetrics = canonicalMetrics(input.current?.contextMetricsExact);
  const appliedByKey = new Map(canonicalAppliedEvents(input.current?.appliedEvents).map(event => [event.eventKey, event] as const));

  const ordered = input.events.slice().sort((left, right) => left.resolutionIndex - right.resolutionIndex || compareText(left.receiptId, right.receiptId) || compareText(left.idempotencyKey, right.idempotencyKey));
  for (const event of ordered) {
    if (canonicalScopedMasteryKey(event.key) !== keyText || event.ruleSetVersion !== SCOPED_MASTERY_RULESET_VERSION) continue;
    assertEventIdentity(event);
    const eligibility = evaluateMasteryEligibility(event);
    if (!eligibility.eligible) continue;
    const identity = masteryEventKey(event.receiptId, event.idempotencyKey);
    const eventDigest = masteryEventDigest(event, eligibility);
    const prior = appliedByKey.get(identity);
    if (prior) {
      if (prior.eventDigest !== eventDigest) throw new Error("MASTERY_IDEMPOTENCY_CONFLICT");
      continue;
    }

    progression = advanceExactSkillProgression(progression, eligibility.effectiveAmountExact);
    lifetimeUses += exact(event.useCountExact ?? "1", "useCountExact");
    qualityScore += exact(event.qualityDeltaExact ?? "0", "qualityDeltaExact");
    contextMetrics = mergeMetrics(contextMetrics, event.contextMetricsExact);
    appliedByKey.set(identity, Object.freeze({ eventKey: identity, eventDigest, receiptId: event.receiptId, idempotencyKey: event.idempotencyKey, resolutionIndex: event.resolutionIndex }));
  }

  const appliedEvents = Object.freeze(Array.from(appliedByKey.values()).sort((left, right) => compareText(left.eventKey, right.eventKey)));
  const appliedReceiptIds = Object.freeze(Array.from(new Set(appliedEvents.map(event => event.receiptId))).sort(compareText));
  const stateHash = hash([
    SCOPED_MASTERY_RULESET_VERSION,
    input.actorId,
    keyText,
    progression.totalXpExact,
    progression.levelExact,
    progression.xpIntoLevelExact,
    lifetimeUses.toString(10),
    qualityScore.toString(10),
    ...Object.entries(contextMetrics).map(([key, value]) => `${key}:${value}`),
    ...appliedEvents.map(event => `${event.eventKey}:${event.eventDigest}:${event.resolutionIndex}`),
  ]);

  return Object.freeze({
    actorId: input.actorId,
    key: input.key,
    progression,
    lifetimeUsesExact: lifetimeUses.toString(10),
    qualityScoreExact: qualityScore.toString(10),
    contextMetricsExact: contextMetrics,
    appliedReceiptIds,
    appliedEvents,
    stateHash,
  });
}

/** Coupled actions may advance multiple independent scopes from the same server receipt. */
export function resolveCoupledMasteries(input: Readonly<{
  actorId: string;
  events: readonly ScopedMasteryEvent[];
  keys: readonly ScopedMasteryKey[];
  currentByKey?: Readonly<Record<string, ScopedMasteryState>>;
}>): readonly ScopedMasteryState[] {
  const unique = new Map<string, ScopedMasteryKey>();
  input.keys.forEach(key => unique.set(canonicalScopedMasteryKey(key), key));
  return Object.freeze(Array.from(unique.values())
    .sort((left, right) => compareText(canonicalScopedMasteryKey(left), canonicalScopedMasteryKey(right)))
    .map(key => {
      const canonical = canonicalScopedMasteryKey(key);
      return resolveScopedMastery({ actorId: input.actorId, key, current: input.currentByKey?.[canonical], events: input.events });
    }));
}
