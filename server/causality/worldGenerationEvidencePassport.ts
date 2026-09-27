import { z } from "zod";
import { canonicalWorldGenerationHash } from "./worldGenerationEvidenceContract";
import type { WorldGenerationParityEvidence } from "./worldGenerationEvidenceContract";

export const AURION_WORLD_GENERATION_EVIDENCE_PASSPORT = "aurion.world-generation.evidence-passport.v1" as const;
export type WorldGenerationRulesetState = "RULESET_CANDIDATE" | "RULESET_ACTIVE";
export type WorldGenerationPassportVerdict = "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE";
export type WorldGenerationInvariantResult = Readonly<{
  id: string;
  verdict: WorldGenerationPassportVerdict;
  resultHash: string;
}>;
export type WorldGenerationCagVerification = Readonly<{
  requestHash: string | null;
  responseHash: string | null;
  resultHash: string | null;
  verdict: WorldGenerationPassportVerdict;
}>;
export type WorldGenerationEvidencePassport = Readonly<{
  schema: typeof AURION_WORLD_GENERATION_EVIDENCE_PASSPORT;
  state: WorldGenerationRulesetState;
  worldGenerationRevision: string;
  generatorVersion: string;
  rulesetHash: string;
  grammarHash: string;
  seedPolicyVersion: string;
  canonicalGraphHash: string;
  chunkProjectionHashes: readonly string[];
  terrainInvariantResults: readonly WorldGenerationInvariantResult[];
  structureInvariantResults: readonly WorldGenerationInvariantResult[];
  cagVerification: WorldGenerationCagVerification;
  verificationVerdict: WorldGenerationPassportVerdict;
  testSuiteIdentifiers: readonly string[];
  evidenceDeterminismHash: string;
  evidenceArtifactIntegrityHash: string;
  createdAt: string;
  passportHash: string;
}>;
export type WorldGenerationEvidencePassportInput = Omit<WorldGenerationEvidencePassport, "passportHash">;

const SHA = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const REVISION = z.string().regex(/^[a-f0-9]{40}$/);
const IDENTIFIER = z.string().trim().min(1).max(256);
const verdict = z.enum(["MATCH", "FIRST_DIVERGENCE", "UNPROVABLE"]);
const invariantSchema = z.strictObject({ id: IDENTIFIER, verdict, resultHash: SHA });
const cagSchema = z.strictObject({
  requestHash: SHA.nullable(),
  responseHash: SHA.nullable(),
  resultHash: SHA.nullable(),
  verdict,
});
export const worldGenerationEvidencePassportInputSchema = z.strictObject({
  schema: z.literal(AURION_WORLD_GENERATION_EVIDENCE_PASSPORT),
  state: z.enum(["RULESET_CANDIDATE", "RULESET_ACTIVE"]),
  worldGenerationRevision: REVISION,
  generatorVersion: IDENTIFIER,
  rulesetHash: SHA,
  grammarHash: SHA,
  seedPolicyVersion: IDENTIFIER,
  canonicalGraphHash: SHA,
  chunkProjectionHashes: z.array(SHA).min(1).max(4096),
  terrainInvariantResults: z.array(invariantSchema).min(1).max(128),
  structureInvariantResults: z.array(invariantSchema).min(1).max(128),
  cagVerification: cagSchema,
  verificationVerdict: verdict,
  testSuiteIdentifiers: z.array(IDENTIFIER).min(1).max(128),
  evidenceDeterminismHash: SHA,
  evidenceArtifactIntegrityHash: SHA,
  createdAt: IDENTIFIER,
});
export const worldGenerationEvidencePassportSchema = worldGenerationEvidencePassportInputSchema.extend({
  passportHash: SHA,
});

function unsignedPassport(value: WorldGenerationEvidencePassport): WorldGenerationEvidencePassportInput {
  const { passportHash: _passportHash, ...unsigned } = value;
  return unsigned;
}
function computePassportHash(value: WorldGenerationEvidencePassportInput): string {
  return canonicalWorldGenerationHash({
    domain: AURION_WORLD_GENERATION_EVIDENCE_PASSPORT,
    ...value,
    chunkProjectionHashes: [...value.chunkProjectionHashes].sort(),
    terrainInvariantResults: [...value.terrainInvariantResults].sort((a, b) => a.id.localeCompare(b.id)),
    structureInvariantResults: [...value.structureInvariantResults].sort((a, b) => a.id.localeCompare(b.id)),
    testSuiteIdentifiers: [...value.testSuiteIdentifiers].sort(),
  });
}
export function createWorldGenerationEvidencePassport(
  value: WorldGenerationEvidencePassportInput,
): WorldGenerationEvidencePassport {
  const parsed = worldGenerationEvidencePassportInputSchema.parse(value);
  const passport = { ...parsed, passportHash: computePassportHash(parsed) };
  return Object.freeze({
    ...passport,
    chunkProjectionHashes: Object.freeze([...parsed.chunkProjectionHashes]),
    terrainInvariantResults: Object.freeze([...parsed.terrainInvariantResults]),
    structureInvariantResults: Object.freeze([...parsed.structureInvariantResults]),
    testSuiteIdentifiers: Object.freeze([...parsed.testSuiteIdentifiers]),
  });
}
export function createCandidateWorldGenerationEvidencePassport(
  evidence: WorldGenerationParityEvidence,
  input: Readonly<{
    generatorVersion: string;
    rulesetHash: string;
    grammarHash: string;
    seedPolicyVersion: string;
    canonicalGraphHash: string;
    chunkProjectionHashes: readonly string[];
    terrainInvariantResults: readonly WorldGenerationInvariantResult[];
    structureInvariantResults: readonly WorldGenerationInvariantResult[];
    cagVerification: WorldGenerationCagVerification;
    testSuiteIdentifiers: readonly string[];
    createdAt: string;
  }>,
): WorldGenerationEvidencePassport {
  return createWorldGenerationEvidencePassport({
    schema: AURION_WORLD_GENERATION_EVIDENCE_PASSPORT,
    state: "RULESET_CANDIDATE",
    worldGenerationRevision: evidence.sourceRevision,
    generatorVersion: input.generatorVersion,
    rulesetHash: evidence.determinismHash,
    grammarHash: input.grammarHash,
    seedPolicyVersion: input.seedPolicyVersion,
    canonicalGraphHash: input.canonicalGraphHash,
    chunkProjectionHashes: input.chunkProjectionHashes,
    terrainInvariantResults: input.terrainInvariantResults,
    structureInvariantResults: input.structureInvariantResults,
    cagVerification: input.cagVerification,
    verificationVerdict: evidence.status,
    testSuiteIdentifiers: input.testSuiteIdentifiers,
    evidenceDeterminismHash: evidence.determinismHash,
    evidenceArtifactIntegrityHash: evidence.artifactIntegrityHash,
    createdAt: input.createdAt,
  });
}
export function verifyWorldGenerationEvidencePassport(value: unknown): boolean {
  const parsed = worldGenerationEvidencePassportSchema.safeParse(value);
  return parsed.success && computePassportHash(unsignedPassport(parsed.data)) === parsed.data.passportHash;
}
export function assertWorldGenerationEvidencePassport(
  value: unknown,
): asserts value is WorldGenerationEvidencePassport {
  const parsed = worldGenerationEvidencePassportSchema.parse(value);
  if (computePassportHash(unsignedPassport(parsed)) !== parsed.passportHash) {
    throw new Error("WORLD_GENERATION_PASSPORT_HASH_INVALID");
  }
}

type PromotionReason =
  | "PASSPORT_INVALID"
  | "NOT_CANDIDATE"
  | "VERIFICATION_NOT_MATCH"
  | "CAG_NOT_MATCH"
  | "CAG_EVIDENCE_INCOMPLETE"
  | "TERRAIN_INVARIANT_NOT_PASS"
  | "STRUCTURE_INVARIANT_NOT_PASS"
  | "TEST_EVIDENCE_MISSING";
export type WorldGenerationRulesetPromotion = Readonly<{
  schema: "aurion.world-generation.ruleset-promotion.v1";
  verdict: "PROMOTE" | "HOLD";
  state: WorldGenerationRulesetState;
  reason: PromotionReason | null;
  passportHash: string;
  promotionHash: string;
}>;
function promotion(value: Omit<WorldGenerationRulesetPromotion, "promotionHash">): WorldGenerationRulesetPromotion {
  return Object.freeze({
    ...value,
    promotionHash: canonicalWorldGenerationHash({ domain: "aurion.world-generation.ruleset-promotion.v1", ...value }),
  });
}
export function evaluateWorldGenerationRulesetPromotion(
  value: unknown,
): WorldGenerationRulesetPromotion {
  const parsed = worldGenerationEvidencePassportSchema.safeParse(value);
  if (!parsed.success || !verifyWorldGenerationEvidencePassport(parsed.data)) {
    return promotion({ schema: "aurion.world-generation.ruleset-promotion.v1", verdict: "HOLD", state: "RULESET_CANDIDATE", reason: "PASSPORT_INVALID", passportHash: "sha256:" + "0".repeat(64) });
  }
  const passport = parsed.data;
  const hold = (reason: PromotionReason): WorldGenerationRulesetPromotion => promotion({ schema: "aurion.world-generation.ruleset-promotion.v1", verdict: "HOLD", state: passport.state, reason, passportHash: passport.passportHash });
  if (passport.state !== "RULESET_CANDIDATE") return hold("NOT_CANDIDATE");
  if (passport.verificationVerdict !== "MATCH") return hold("VERIFICATION_NOT_MATCH");
  if (passport.cagVerification.verdict !== "MATCH") return hold("CAG_NOT_MATCH");
  if (!passport.cagVerification.requestHash || !passport.cagVerification.responseHash || !passport.cagVerification.resultHash) return hold("CAG_EVIDENCE_INCOMPLETE");
  if (passport.terrainInvariantResults.some(result => result.verdict !== "MATCH")) return hold("TERRAIN_INVARIANT_NOT_PASS");
  if (passport.structureInvariantResults.some(result => result.verdict !== "MATCH")) return hold("STRUCTURE_INVARIANT_NOT_PASS");
  if (passport.testSuiteIdentifiers.length === 0) return hold("TEST_EVIDENCE_MISSING");
  return promotion({ schema: "aurion.world-generation.ruleset-promotion.v1", verdict: "PROMOTE", state: "RULESET_ACTIVE", reason: null, passportHash: passport.passportHash });
}
export function promoteWorldGenerationRuleset(
  passport: WorldGenerationEvidencePassport,
): WorldGenerationEvidencePassport {
  const result = evaluateWorldGenerationRulesetPromotion(passport);
  if (result.verdict !== "PROMOTE") throw new Error("WORLD_GENERATION_RULESET_PROMOTION_" + result.reason);
  return createWorldGenerationEvidencePassport({ ...unsignedPassport(passport), state: "RULESET_ACTIVE" });
}
