/**
 * Aurion Deterministic Rumor-to-Behavior Bridge — shared contract surface.
 *
 * Issue #783: Lets the existing NPC utility planner (#486) consume #781
 * rumor claims as bounded belief inputs, so rumors can influence behavior
 * without ever becoming world truth.
 *
 * Core distinction:
 *
 *   claim truth status != actor belief strength
 *
 * Flow:
 *
 *   information claim
 *     + source trust
 *     + evidence class
 *     + freshness
 *     + corroboration
 *     -> bounded beliefQ16
 *     -> existing candidate evaluation
 *     -> existing utility / coordination constraints
 *     -> typed action
 *     -> gateway
 *     -> causal receipt
 *
 * Safeguards implemented here:
 *  - a rumor can never set route danger, prices, faction state or any other
 *    canonical truth; it only shifts the planner-local BPS factors of
 *    explicit candidates through versioned mappings;
 *  - belief arithmetic is integer Q16 fixed-point with clamping;
 *  - each mapping applies at most once per candidate (max, never a sum), so
 *    rumor amplification is bounded and non-recursive;
 *  - canonical ordering of evidence inputs; same claim set => same belief
 *    vector regardless of input order;
 *  - no wall-clock, no randomness, no runtime LLM.
 */
import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import { candidateSetHash, type NpcUtilityCandidate } from "./npcUtilityPlannerProtocol";
import {
  bpsToQ16,
  RUMOR_Q16_ONE,
  rumorClaimProjectionSchema,
  type RumorClaimProjection,
} from "./rumorProjectionProtocol";

// ---------------------------------------------------------------------------
// Version / ruleset
// ---------------------------------------------------------------------------

export const RUMOR_BELIEF_BRIDGE_PROTOCOL = "aurion.rumor-belief-bridge.v1" as const;
export const RUMOR_BELIEF_RULESET = "aurion.rumor-belief.ruleset.v1" as const;

/**
 * Evidence weight per class, in Q16. DIRECT observation carries full weight;
 * communicated and inferred claims are discounted.
 */
export const BELIEF_EVIDENCE_WEIGHT_Q16 = Object.freeze({
  DIRECT: 65_536,
  COMMUNICATED: 49_152,
  INFERRED: 32_768,
} as const);

/** Neutral corroboration factor (Q16) when no relations exist. */
export const BELIEF_CORROBORATION_NEUTRAL_Q16 = 32_768;
/** Q16 added per corroborating visible claim. */
export const BELIEF_CORROBORATION_STEP_Q16 = 8_192;
/** Q16 removed per contradicting visible claim. */
export const BELIEF_CONTRADICTION_STEP_Q16 = 16_384;
/** Bounds of the corroboration factor. */
export const BELIEF_CORROBORATION_MIN_Q16 = 8_192;
export const BELIEF_CORROBORATION_MAX_Q16 = RUMOR_Q16_ONE;

/** Default source trust (BPS) when no explicit relation exists. */
export const BELIEF_DEFAULT_SOURCE_TRUST_BPS = 5_000;

/** Hard bound for any single belief-driven candidate adjustment. */
export const BELIEF_MAX_DELTA_BPS = 2_500;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const q16 = z.number().int().min(0).max(RUMOR_Q16_ONE);
const bps = z.number().int().min(0).max(10_000);

export const beliefEntrySchema = z.strictObject({
  claimId: identifier,
  claimKey: sha256,
  subjectId: identifier,
  predicate: identifier,
  value: z.string().trim().min(1).max(255),
  beliefQ16: q16,
});
export type BeliefEntry = Readonly<z.infer<typeof beliefEntrySchema>>;

export const beliefVectorSchema = z.strictObject({
  version: z.literal(RUMOR_BELIEF_BRIDGE_PROTOCOL),
  ruleset: z.literal(RUMOR_BELIEF_RULESET),
  worldId: identifier,
  actorId: identifier,
  atIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  entries: z.array(beliefEntrySchema),
  beliefVectorHash: sha256,
});
export type BeliefVector = Readonly<z.infer<typeof beliefVectorSchema>>;

/**
 * Versioned coupling rule: which claim predicate (optionally scoped to a
 * subject) may shift which planner-local BPS factor of which candidates,
 * by at most how much. Design data, part of the ruleset; never runtime-
 * generated and never a canonical-state write.
 */
export const beliefMappingSchema = z.strictObject({
  predicate: identifier,
  subjectId: identifier.nullable(),
  target: z.enum(["riskBps", "benefitBps", "costBps"]),
  sign: z.union([z.literal(1), z.literal(-1)]),
  maxDeltaBps: z.number().int().min(0).max(BELIEF_MAX_DELTA_BPS),
  appliesToCandidateIds: z.array(identifier).nullable(),
});
export type BeliefMapping = Readonly<z.infer<typeof beliefMappingSchema>>;

export const beliefAdjustmentReceiptSchema = z.strictObject({
  version: z.literal(RUMOR_BELIEF_BRIDGE_PROTOCOL),
  ruleset: z.literal(RUMOR_BELIEF_RULESET),
  beliefVectorHash: sha256,
  candidateSetHashBefore: z.string(),
  candidateSetHashAfter: z.string(),
  mappings: z.array(beliefMappingSchema),
  adjustmentHash: sha256,
});
export type BeliefAdjustmentReceipt = Readonly<z.infer<typeof beliefAdjustmentReceiptSchema>>;

// ---------------------------------------------------------------------------
// Deterministic Q16 arithmetic
// ---------------------------------------------------------------------------

/** Q16 multiplication: floor(a * b / 65536). Inputs bounded => exact. */
export function q16Mul(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0 ||
      a > RUMOR_Q16_ONE || b > RUMOR_Q16_ONE) {
    throw new Error("BELIEF_Q16_OPERAND_INVALID");
  }
  return Math.floor((a * b) / RUMOR_Q16_ONE);
}

function clampQ16(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Versioned corroboration factor in Q16, bounded in both directions. */
export function corroborationFactorQ16(corroborations: number, contradictions: number): number {
  if (!Number.isSafeInteger(corroborations) || corroborations < 0 ||
      !Number.isSafeInteger(contradictions) || contradictions < 0) {
    throw new Error("BELIEF_RELATION_COUNT_INVALID");
  }
  return clampQ16(
    BELIEF_CORROBORATION_NEUTRAL_Q16 +
      corroborations * BELIEF_CORROBORATION_STEP_Q16 -
      contradictions * BELIEF_CONTRADICTION_STEP_Q16,
    BELIEF_CORROBORATION_MIN_Q16,
    BELIEF_CORROBORATION_MAX_Q16,
  );
}

/**
 * Bounded belief weight of one claim for one actor:
 *
 *   beliefQ16 = clamp(
 *     evidenceWeightQ16 * sourceTrustQ16 * freshnessQ16 * corroborationQ16
 *   )
 *
 * All factors are Q16 integers; the result is deterministic and bounded.
 */
export function beliefWeightQ16(input: Readonly<{
  claim: RumorClaimProjection;
  sourceTrustBps: number;
}>): number {
  const claim = rumorClaimProjectionSchema.parse(input.claim);
  const trustQ16 = bpsToQ16(input.sourceTrustBps);
  const evidenceQ16 = BELIEF_EVIDENCE_WEIGHT_Q16[claim.evidenceClass];
  const factorQ16 = corroborationFactorQ16(
    claim.corroboratedBy.length,
    claim.contradictedBy.length,
  );
  return q16Mul(q16Mul(q16Mul(evidenceQ16, trustQ16), claim.freshnessQ16), factorQ16);
}

// ---------------------------------------------------------------------------
// Belief vector
// ---------------------------------------------------------------------------

/**
 * Build the canonical belief vector of one actor from its visible claims.
 * Canonical ordering of evidence inputs: entries are sorted by claimId, so
 * shuffled source order cannot change the result. Trust toward a claim's
 * witnesses is the maximum explicit trust, or the default otherwise.
 */
export function buildBeliefVector(input: Readonly<{
  actorId: string;
  worldId: string;
  atIndex: number;
  claims: readonly RumorClaimProjection[];
  sourceTrustBpsByWitness?: Readonly<Record<string, number>>;
}>): BeliefVector {
  const actorId = identifier.parse(input.actorId);
  const worldId = identifier.parse(input.worldId);
  if (!Number.isSafeInteger(input.atIndex) || input.atIndex < 0) {
    throw new Error("BELIEF_AT_INDEX_INVALID");
  }
  const trustByWitness = input.sourceTrustBpsByWitness ?? {};
  for (const [witnessId, trust] of Object.entries(trustByWitness)) {
    identifier.parse(witnessId);
    bps.parse(trust);
  }

  const entries = [...input.claims]
    .map(raw => rumorClaimProjectionSchema.parse(raw))
    .sort((a, b) => a.claimId.localeCompare(b.claimId))
    .map(claim => {
      const trustBps = claim.witnessIds.length === 0
        ? BELIEF_DEFAULT_SOURCE_TRUST_BPS
        : Math.max(...claim.witnessIds.map(id => trustByWitness[id] ?? BELIEF_DEFAULT_SOURCE_TRUST_BPS));
      return beliefEntrySchema.parse({
        claimId: claim.claimId,
        claimKey: claim.claimKey,
        subjectId: claim.subjectId,
        predicate: claim.predicate,
        value: claim.value,
        beliefQ16: beliefWeightQ16({ claim, sourceTrustBps: trustBps }),
      });
    });

  const unsigned = {
    version: RUMOR_BELIEF_BRIDGE_PROTOCOL,
    ruleset: RUMOR_BELIEF_RULESET,
    worldId,
    actorId,
    atIndex: input.atIndex,
    entries,
  };
  const beliefVectorHash = canonicalSha256({
    domain: "aurion.rumor-belief-vector.v1",
    value: unsigned,
  });
  return beliefVectorSchema.parse({ ...unsigned, beliefVectorHash });
}

// ---------------------------------------------------------------------------
// Planner coupling — bounded candidate adjustment
// ---------------------------------------------------------------------------

function clampBps(value: number): number {
  if (value < 0) return 0;
  if (value > 10_000) return 10_000;
  return value;
}

/**
 * Apply a confirmed belief vector to existing planner candidates through
 * versioned mappings. Returns NEW candidate objects; inputs are never
 * mutated, and no canonical world field exists here to mutate.
 *
 * Amplification bound: for each (candidate, mapping) pair the single
 * strongest matching belief applies exactly once; deltas never exceed
 * BELIEF_MAX_DELTA_BPS and results stay within [0, 10000] BPS.
 */
export function applyBeliefToCandidates(input: Readonly<{
  candidates: readonly NpcUtilityCandidate[];
  beliefs: BeliefVector;
  mappings: readonly BeliefMapping[];
}>): Readonly<{ candidates: readonly NpcUtilityCandidate[]; receipt: BeliefAdjustmentReceipt }> {
  const beliefs = beliefVectorSchema.parse(input.beliefs);
  const mappings = input.mappings.map(mapping => beliefMappingSchema.parse(mapping));
  const before = candidateSetHash(input.candidates);

  const adjusted = input.candidates.map(candidate => {
    let next = candidate;
    for (const mapping of mappings) {
      if (mapping.appliesToCandidateIds !== null &&
          !mapping.appliesToCandidateIds.includes(candidate.id)) {
        continue;
      }
      const matching = beliefs.entries.filter(entry =>
        entry.predicate === mapping.predicate &&
        (mapping.subjectId === null || entry.subjectId === mapping.subjectId)
      );
      if (matching.length === 0) continue;
      // Bounded, non-recursive: max single belief, applied once.
      const strongest = matching.reduce((a, b) => (b.beliefQ16 > a.beliefQ16 ? b : a));
      const delta = Math.floor((strongest.beliefQ16 * mapping.maxDeltaBps) / RUMOR_Q16_ONE);
      if (delta === 0) continue;
      const updated = clampBps(next[mapping.target] + mapping.sign * delta);
      if (updated !== next[mapping.target]) {
        next = Object.freeze({ ...next, [mapping.target]: updated });
      }
    }
    return next;
  });

  const after = candidateSetHash(adjusted);
  const unsignedReceipt = {
    version: RUMOR_BELIEF_BRIDGE_PROTOCOL,
    ruleset: RUMOR_BELIEF_RULESET,
    beliefVectorHash: beliefs.beliefVectorHash,
    candidateSetHashBefore: before,
    candidateSetHashAfter: after,
    mappings,
  };
  const receipt = beliefAdjustmentReceiptSchema.parse({
    ...unsignedReceipt,
    adjustmentHash: canonicalSha256({
      domain: "aurion.rumor-belief-adjustment.v1",
      value: unsignedReceipt,
    }),
  });
  return Object.freeze({ candidates: Object.freeze(adjusted), receipt });
}
