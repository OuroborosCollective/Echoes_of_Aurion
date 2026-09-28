import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";

/**
 * AIM-546: deterministic dynamic NPC needs.
 *
 * Need values are deficits in basis points: 0 means fully satisfied and
 * 10_000 means maximally unmet. Aurion owns the transition; callers provide
 * only confirmed pressure, impact, satisfaction, and opportunity evidence.
 *
 * Per need and resolution index:
 *   next = clamp(previous + pressure + decay + impacts - confirmedSatisfaction)
 *
 * Starvation and dehydration add deterministic, explicitly recorded health
 * impacts after their own needs are resolved. No wall clock, random source,
 * client state, or external model is consulted.
 */
export const AURION_NEED_DYNAMICS_PROTOCOL = "aurion.need-dynamics.v1" as const;
export const NEED_DYNAMICS_BPS_MAX = 10_000;
export const NEED_DYNAMICS_MAX_TERMS = 64;
export const NEED_DYNAMICS_ACTION_THRESHOLD_BPS = 6_000;
export const NEED_DYNAMICS_CRITICAL_THRESHOLD_BPS = 8_000;
export const NEED_DYNAMICS_STARVATION_DAMAGE_DIVISOR = 2;
export const NEED_DYNAMICS_DEHYDRATION_DAMAGE_NUMERATOR = 3;
export const NEED_DYNAMICS_DEHYDRATION_DAMAGE_DENOMINATOR = 4;

export const needDynamicsNeedKinds = [
  "survival",
  "hydration",
  "shelter",
  "health",
  "safety",
  "energy",
  "inventory_sufficiency",
  "wealth",
  "belonging",
  "status",
  "family",
  "occupation",
  "knowledge_adventure",
] as const;
export type NeedDynamicsNeedKind = (typeof needDynamicsNeedKinds)[number];

export const needDynamicsActionKinds = [
  "forage",
  "farm",
  "trade",
  "migrate",
  "raid",
  "defend",
  "fortify",
  "join_group",
  "diplomacy",
  "build",
  "buy",
  "rest",
  "heal",
  "gather",
  "work",
  "socialize",
  "form_household",
  "explore",
] as const;
export type NeedDynamicsActionKind = (typeof needDynamicsActionKinds)[number];

export const needDynamicsConditionKinds = [
  "starving",
  "dehydrated",
  "health_critical",
  "dead",
] as const;
export type NeedDynamicsConditionKind =
  (typeof needDynamicsConditionKinds)[number];

export type NeedDynamicsNeeds = Readonly<Record<NeedDynamicsNeedKind, number>>;

export type NeedDynamicsPressure = Readonly<{
  id: string;
  sourceReceiptId: string;
  need: NeedDynamicsNeedKind;
  pressureBps: number;
  decayBps: number;
  resolutionIndex: number;
}>;

export type NeedDynamicsImpact = Readonly<{
  id: string;
  sourceReceiptId: string;
  need: NeedDynamicsNeedKind;
  magnitudeBps: number;
  resolutionIndex: number;
}>;

/** A satisfaction cannot affect state without an explicit confirmation receipt. */
export type NeedDynamicsSatisfaction = Readonly<{
  id: string;
  sourceReceiptId: string;
  confirmationReceiptId: string;
  need: NeedDynamicsNeedKind;
  magnitudeBps: number;
  resolutionIndex: number;
}>;

/** A confirmed and constraint-checked opportunity, never a client-authored command. */
export type NeedDynamicsActionOpportunity = Readonly<{
  id: string;
  sourceReceiptId: string;
  action: NeedDynamicsActionKind;
  resolutionIndex: number;
  constraintStatus: "eligible" | "blocked";
  constraintCode: string | null;
}>;

export type NeedDynamicsActionCandidate = Readonly<{
  id: string;
  opportunityId: string;
  sourceReceiptId: string;
  need: NeedDynamicsNeedKind;
  action: NeedDynamicsActionKind;
  needBps: number;
  thresholdBps: number;
  resolutionIndex: number;
}>;

export type NeedDynamicsState = Readonly<{
  protocol: typeof AURION_NEED_DYNAMICS_PROTOCOL;
  entityId: string;
  regionId: string;
  resolutionIndex: number;
  revision: number;
  needs: NeedDynamicsNeeds;
  lifeStatus: "alive" | "dead";
  conditions: readonly NeedDynamicsConditionKind[];
  stateHash: string;
}>;

export type NeedDynamicsResolution = Readonly<{
  protocol: typeof AURION_NEED_DYNAMICS_PROTOCOL;
  entityId: string;
  regionId: string;
  resolutionIndex: number;
  previousStateHash: string;
  inputHash: string;
  pressures: readonly NeedDynamicsPressure[];
  impacts: readonly NeedDynamicsImpact[];
  satisfactions: readonly NeedDynamicsSatisfaction[];
  derivedHealthImpacts: Readonly<{
    starvationBps: number;
    dehydrationBps: number;
  }>;
  nextState: NeedDynamicsState;
  candidates: readonly NeedDynamicsActionCandidate[];
  candidateSetHash: string;
  resolutionHash: string;
}>;

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const bps = z.number().int().min(0).max(NEED_DYNAMICS_BPS_MAX);
const signedBps = z
  .number()
  .int()
  .min(-NEED_DYNAMICS_BPS_MAX)
  .max(NEED_DYNAMICS_BPS_MAX);
const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const needKind = z.enum(needDynamicsNeedKinds);
const actionKind = z.enum(needDynamicsActionKinds);
const conditionKind = z.enum(needDynamicsConditionKinds);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const needDynamicsNeedsSchema = z.strictObject({
  survival: bps,
  hydration: bps,
  shelter: bps,
  health: bps,
  safety: bps,
  energy: bps,
  inventory_sufficiency: bps,
  wealth: bps,
  belonging: bps,
  status: bps,
  family: bps,
  occupation: bps,
  knowledge_adventure: bps,
});

export const needDynamicsPressureSchema = z.strictObject({
  id: identifier,
  sourceReceiptId: identifier,
  need: needKind,
  pressureBps: signedBps,
  decayBps: bps,
  resolutionIndex: nonNegativeInteger,
});

export const needDynamicsImpactSchema = z.strictObject({
  id: identifier,
  sourceReceiptId: identifier,
  need: needKind,
  magnitudeBps: signedBps,
  resolutionIndex: nonNegativeInteger,
});

export const needDynamicsSatisfactionSchema = z.strictObject({
  id: identifier,
  sourceReceiptId: identifier,
  confirmationReceiptId: identifier,
  need: needKind,
  magnitudeBps: bps,
  resolutionIndex: nonNegativeInteger,
});

export const needDynamicsActionOpportunitySchema = z.strictObject({
  id: identifier,
  sourceReceiptId: identifier,
  action: actionKind,
  resolutionIndex: nonNegativeInteger,
  constraintStatus: z.enum(["eligible", "blocked"]),
  constraintCode: identifier.nullable(),
});

export const needDynamicsActionCandidateSchema = z.strictObject({
  id: identifier,
  opportunityId: identifier,
  sourceReceiptId: identifier,
  need: needKind,
  action: actionKind,
  needBps: bps,
  thresholdBps: bps,
  resolutionIndex: nonNegativeInteger,
});

export const needDynamicsStateSchema = z.strictObject({
  protocol: z.literal(AURION_NEED_DYNAMICS_PROTOCOL),
  entityId: identifier,
  regionId: identifier,
  resolutionIndex: nonNegativeInteger,
  revision: positiveInteger,
  needs: needDynamicsNeedsSchema,
  lifeStatus: z.enum(["alive", "dead"]),
  conditions: z.array(conditionKind).max(needDynamicsConditionKinds.length),
  stateHash: sha256,
});

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const clampBps = (value: number): number =>
  Math.max(0, Math.min(NEED_DYNAMICS_BPS_MAX, value));
const freeze = <Value>(value: Value): Readonly<Value> => Object.freeze(value);

const freezeNeeds = (needs: NeedDynamicsNeeds): NeedDynamicsNeeds =>
  freeze({
    survival: needs.survival,
    hydration: needs.hydration,
    shelter: needs.shelter,
    health: needs.health,
    safety: needs.safety,
    energy: needs.energy,
    inventory_sufficiency: needs.inventory_sufficiency,
    wealth: needs.wealth,
    belonging: needs.belonging,
    status: needs.status,
    family: needs.family,
    occupation: needs.occupation,
    knowledge_adventure: needs.knowledge_adventure,
  });

function conditionsFor(
  needs: NeedDynamicsNeeds
): readonly NeedDynamicsConditionKind[] {
  const conditions: NeedDynamicsConditionKind[] = [];
  if (needs.survival >= NEED_DYNAMICS_CRITICAL_THRESHOLD_BPS)
    conditions.push("starving");
  if (needs.hydration >= NEED_DYNAMICS_CRITICAL_THRESHOLD_BPS)
    conditions.push("dehydrated");
  if (needs.health >= NEED_DYNAMICS_CRITICAL_THRESHOLD_BPS)
    conditions.push("health_critical");
  if (needs.health === NEED_DYNAMICS_BPS_MAX) conditions.push("dead");
  return freeze(conditions);
}

function stateHashValue(value: Omit<NeedDynamicsState, "stateHash">): string {
  return canonicalSha256({
    domain: AURION_NEED_DYNAMICS_PROTOCOL,
    state: value,
  });
}

function parseState(value: NeedDynamicsState): NeedDynamicsState {
  const parsed = needDynamicsStateSchema.parse(value);
  const needs = freezeNeeds(parsed.needs);
  const conditions = conditionsFor(needs);
  const lifeStatus =
    needs.health === NEED_DYNAMICS_BPS_MAX
      ? ("dead" as const)
      : ("alive" as const);
  if (
    parsed.lifeStatus !== lifeStatus ||
    JSON.stringify(parsed.conditions) !== JSON.stringify(conditions)
  ) {
    throw new Error("NEED_DYNAMICS_STATE_LIFE_STATUS_MISMATCH");
  }
  const envelope = {
    protocol: parsed.protocol,
    entityId: parsed.entityId,
    regionId: parsed.regionId,
    resolutionIndex: parsed.resolutionIndex,
    revision: parsed.revision,
    needs,
    lifeStatus,
    conditions,
  };
  if (parsed.stateHash !== stateHashValue(envelope))
    throw new Error("NEED_DYNAMICS_STATE_HASH_MISMATCH");
  return freeze({ ...envelope, stateHash: parsed.stateHash });
}

export function assertNeedDynamicsState(
  value: unknown
): asserts value is NeedDynamicsState {
  parseState(value as NeedDynamicsState);
}

export function createInitialNeedDynamicsState(
  input: Readonly<{
    entityId: string;
    regionId: string;
    resolutionIndex: number;
    needs: NeedDynamicsNeeds;
  }>
): NeedDynamicsState {
  const entityId = identifier.parse(input.entityId);
  const regionId = identifier.parse(input.regionId);
  const resolutionIndex = nonNegativeInteger.parse(input.resolutionIndex);
  const needs = freezeNeeds(needDynamicsNeedsSchema.parse(input.needs));
  const conditions = conditionsFor(needs);
  const envelope = {
    protocol: AURION_NEED_DYNAMICS_PROTOCOL,
    entityId,
    regionId,
    resolutionIndex,
    revision: 1,
    needs,
    lifeStatus:
      needs.health === NEED_DYNAMICS_BPS_MAX
        ? ("dead" as const)
        : ("alive" as const),
    conditions,
  };
  return freeze({ ...envelope, stateHash: stateHashValue(envelope) });
}

type TermBase = Readonly<{
  id: string;
  sourceReceiptId: string;
  need: NeedDynamicsNeedKind;
  resolutionIndex: number;
}>;

function normalizeTerms<T extends TermBase>(
  values: readonly T[],
  schema: z.ZodType<T>,
  resolutionIndex: number,
  label: string
): readonly T[] {
  if (values.length > NEED_DYNAMICS_MAX_TERMS)
    throw new Error(`NEED_DYNAMICS_${label}_OVERFLOW`);
  const parsed = values.map(value => schema.parse(value));
  const ids = new Set<string>();
  for (const value of parsed) {
    if (value.resolutionIndex !== resolutionIndex)
      throw new Error(`NEED_DYNAMICS_${label}_INDEX_MISMATCH`);
    if (ids.has(value.id)) throw new Error(`NEED_DYNAMICS_${label}_DUPLICATE`);
    ids.add(value.id);
  }
  return freeze(
    [...parsed].sort(
      (left, right) =>
        compare(left.need, right.need) ||
        compare(left.sourceReceiptId, right.sourceReceiptId) ||
        compare(left.id, right.id)
    )
  );
}

function assertUniqueSatisfactionConfirmations(
  values: readonly NeedDynamicsSatisfaction[]
): void {
  const confirmationTargets = new Set<string>();
  for (const satisfaction of values) {
    const key =
      satisfaction.confirmationReceiptId + "\u001f" + satisfaction.need;
    if (confirmationTargets.has(key))
      throw new Error("NEED_DYNAMICS_SATISFACTION_CONFIRMATION_DUPLICATE");
    confirmationTargets.add(key);
  }
}

function normalizeOpportunities(
  values: readonly NeedDynamicsActionOpportunity[],
  resolutionIndex: number
): readonly NeedDynamicsActionOpportunity[] {
  if (values.length > NEED_DYNAMICS_MAX_TERMS)
    throw new Error("NEED_DYNAMICS_OPPORTUNITY_OVERFLOW");
  const parsed = values.map(value =>
    needDynamicsActionOpportunitySchema.parse(value)
  );
  const ids = new Set<string>();
  for (const value of parsed) {
    if (value.resolutionIndex > resolutionIndex)
      throw new Error("NEED_DYNAMICS_OPPORTUNITY_FROM_FUTURE");
    if (ids.has(value.id))
      throw new Error("NEED_DYNAMICS_OPPORTUNITY_DUPLICATE");
    ids.add(value.id);
  }
  return freeze(
    [...parsed].sort(
      (left, right) =>
        compare(left.action, right.action) ||
        compare(left.sourceReceiptId, right.sourceReceiptId) ||
        compare(left.id, right.id)
    )
  );
}

const actionRules: readonly Readonly<{
  need: NeedDynamicsNeedKind;
  actions: readonly NeedDynamicsActionKind[];
}>[] = freeze([
  freeze({
    need: "survival",
    actions: freeze(["forage", "farm", "trade", "migrate", "raid"]),
  }),
  freeze({
    need: "hydration",
    actions: freeze(["forage", "trade", "migrate"]),
  }),
  freeze({ need: "shelter", actions: freeze(["build", "buy", "migrate"]) }),
  freeze({ need: "health", actions: freeze(["heal", "trade", "migrate"]) }),
  freeze({
    need: "safety",
    actions: freeze([
      "defend",
      "fortify",
      "join_group",
      "migrate",
      "diplomacy",
    ]),
  }),
  freeze({ need: "energy", actions: freeze(["rest"]) }),
  freeze({
    need: "inventory_sufficiency",
    actions: freeze(["gather", "trade", "work"]),
  }),
  freeze({ need: "wealth", actions: freeze(["work", "trade"]) }),
  freeze({ need: "belonging", actions: freeze(["socialize", "join_group"]) }),
  freeze({ need: "status", actions: freeze(["work", "diplomacy"]) }),
  freeze({ need: "family", actions: freeze(["form_household", "socialize"]) }),
  freeze({ need: "occupation", actions: freeze(["work", "trade"]) }),
  freeze({
    need: "knowledge_adventure",
    actions: freeze(["explore", "join_group"]),
  }),
]);

function deriveCandidates(
  state: NeedDynamicsState,
  opportunities: readonly NeedDynamicsActionOpportunity[]
): readonly NeedDynamicsActionCandidate[] {
  if (state.lifeStatus === "dead") return freeze([]);
  const candidates: NeedDynamicsActionCandidate[] = [];
  for (const rule of actionRules) {
    const needBps = state.needs[rule.need];
    if (needBps < NEED_DYNAMICS_ACTION_THRESHOLD_BPS) continue;
    for (const opportunity of opportunities) {
      if (
        opportunity.constraintStatus !== "eligible" ||
        !rule.actions.includes(opportunity.action)
      )
        continue;
      candidates.push(
        freeze({
          id: `candidate:${rule.need}:${opportunity.id}`,
          opportunityId: opportunity.id,
          sourceReceiptId: opportunity.sourceReceiptId,
          need: rule.need,
          action: opportunity.action,
          needBps,
          thresholdBps: NEED_DYNAMICS_ACTION_THRESHOLD_BPS,
          resolutionIndex: state.resolutionIndex,
        })
      );
    }
  }
  return freeze(
    candidates.sort(
      (left, right) =>
        right.needBps - left.needBps ||
        compare(left.need, right.need) ||
        compare(left.action, right.action) ||
        compare(left.id, right.id)
    )
  );
}

/**
 * Generates only receipt-backed, precondition-eligible actions. `found_city`
 * is deliberately absent from the action vocabulary: settlement emergence is
 * a downstream consequence of proven population, resources, shelter, safety,
 * connectivity, and cohesion—not a direct need command.
 */
export function deriveNeedDynamicsActionCandidates(
  input: Readonly<{
    state: NeedDynamicsState;
    opportunities: readonly NeedDynamicsActionOpportunity[];
  }>
): readonly NeedDynamicsActionCandidate[] {
  const state = parseState(input.state);
  const opportunities = normalizeOpportunities(
    input.opportunities,
    state.resolutionIndex
  );
  return deriveCandidates(state, opportunities);
}

function sumForNeed<T extends Readonly<{ need: NeedDynamicsNeedKind }>>(
  values: readonly T[],
  need: NeedDynamicsNeedKind,
  valueOf: (value: T) => number
): number {
  return values.reduce(
    (sum, value) => (value.need === need ? sum + valueOf(value) : sum),
    0
  );
}

function deriveVitalHealthImpacts(
  needs: NeedDynamicsNeeds
): Readonly<{ starvationBps: number; dehydrationBps: number }> {
  return freeze({
    starvationBps: Math.floor(
      Math.max(0, needs.survival - NEED_DYNAMICS_CRITICAL_THRESHOLD_BPS) /
        NEED_DYNAMICS_STARVATION_DAMAGE_DIVISOR
    ),
    dehydrationBps: Math.floor(
      (Math.max(0, needs.hydration - NEED_DYNAMICS_CRITICAL_THRESHOLD_BPS) *
        NEED_DYNAMICS_DEHYDRATION_DAMAGE_NUMERATOR) /
        NEED_DYNAMICS_DEHYDRATION_DAMAGE_DENOMINATOR
    ),
  });
}

export function resolveNeedDynamicsStep(
  input: Readonly<{
    currentState: NeedDynamicsState;
    resolutionIndex: number;
    pressures: readonly NeedDynamicsPressure[];
    impacts: readonly NeedDynamicsImpact[];
    satisfactions: readonly NeedDynamicsSatisfaction[];
    opportunities?: readonly NeedDynamicsActionOpportunity[];
  }>
): NeedDynamicsResolution {
  const previous = parseState(input.currentState);
  if (previous.lifeStatus === "dead")
    throw new Error("NEED_DYNAMICS_DEAD_ENTITY");
  const resolutionIndex = nonNegativeInteger.parse(input.resolutionIndex);
  if (resolutionIndex !== previous.resolutionIndex + 1)
    throw new Error("NEED_DYNAMICS_RESOLUTION_INDEX_NOT_NEXT");

  const pressures = normalizeTerms(
    input.pressures,
    needDynamicsPressureSchema,
    resolutionIndex,
    "PRESSURE"
  );
  const impacts = normalizeTerms(
    input.impacts,
    needDynamicsImpactSchema,
    resolutionIndex,
    "IMPACT"
  );
  const satisfactions = normalizeTerms(
    input.satisfactions,
    needDynamicsSatisfactionSchema,
    resolutionIndex,
    "SATISFACTION"
  );
  assertUniqueSatisfactionConfirmations(satisfactions);
  const opportunities = normalizeOpportunities(
    input.opportunities ?? [],
    resolutionIndex
  );

  const provisional = {} as Record<NeedDynamicsNeedKind, number>;
  for (const need of needDynamicsNeedKinds) {
    provisional[need] = clampBps(
      previous.needs[need] +
        sumForNeed(pressures, need, value => value.pressureBps) +
        sumForNeed(pressures, need, value => value.decayBps) +
        sumForNeed(impacts, need, value => value.magnitudeBps) -
        sumForNeed(satisfactions, need, value => value.magnitudeBps)
    );
  }
  const provisionalNeeds = freezeNeeds(provisional);
  const derivedHealthImpacts = deriveVitalHealthImpacts(provisionalNeeds);
  const nextNeeds = freezeNeeds({
    ...provisionalNeeds,
    health: clampBps(
      provisionalNeeds.health +
        derivedHealthImpacts.starvationBps +
        derivedHealthImpacts.dehydrationBps
    ),
  });
  const conditions = conditionsFor(nextNeeds);
  const stateEnvelope = {
    protocol: AURION_NEED_DYNAMICS_PROTOCOL,
    entityId: previous.entityId,
    regionId: previous.regionId,
    resolutionIndex,
    revision: previous.revision + 1,
    needs: nextNeeds,
    lifeStatus:
      nextNeeds.health === NEED_DYNAMICS_BPS_MAX
        ? ("dead" as const)
        : ("alive" as const),
    conditions,
  };
  const nextState = freeze({
    ...stateEnvelope,
    stateHash: stateHashValue(stateEnvelope),
  });
  const candidates = deriveCandidates(nextState, opportunities);
  const candidateSetHash = canonicalSha256({
    domain: "aurion.need-dynamics.candidate-set.v1",
    entityId: previous.entityId,
    resolutionIndex,
    candidates,
  });
  const inputHash = canonicalSha256({
    domain: "aurion.need-dynamics.input.v1",
    previousStateHash: previous.stateHash,
    resolutionIndex,
    pressures,
    impacts,
    satisfactions,
    opportunities,
  });
  const resolutionHash = canonicalSha256({
    protocol: AURION_NEED_DYNAMICS_PROTOCOL,
    previousStateHash: previous.stateHash,
    inputHash,
    nextStateHash: nextState.stateHash,
    derivedHealthImpacts,
    candidateSetHash,
  });
  return freeze({
    protocol: AURION_NEED_DYNAMICS_PROTOCOL,
    entityId: previous.entityId,
    regionId: previous.regionId,
    resolutionIndex,
    previousStateHash: previous.stateHash,
    inputHash,
    pressures,
    impacts,
    satisfactions,
    derivedHealthImpacts,
    nextState,
    candidates,
    candidateSetHash,
    resolutionHash,
  });
}

export function verifyNeedDynamicsReplay(
  left: NeedDynamicsResolution,
  right: NeedDynamicsResolution
): boolean {
  assertNeedDynamicsState(left.nextState);
  assertNeedDynamicsState(right.nextState);
  return (
    left.resolutionHash === right.resolutionHash &&
    left.nextState.stateHash === right.nextState.stateHash
  );
}
