import { describe, expect, it } from "vitest";
import {
  AURION_WORLD_GENERATION_EVIDENCE_PASSPORT,
  createWorldGenerationEvidencePassport,
  evaluateWorldGenerationRulesetPromotion,
  promoteWorldGenerationRuleset,
  verifyWorldGenerationEvidencePassport,
  type WorldGenerationEvidencePassportInput,
} from "./worldGenerationEvidencePassport";

const sha = (digit: string) => `sha256:${digit.repeat(64)}`;
const revision = "a".repeat(40);
function candidate(overrides: Partial<WorldGenerationEvidencePassportInput> = {}) {
  const base: WorldGenerationEvidencePassportInput = {
    schema: AURION_WORLD_GENERATION_EVIDENCE_PASSPORT,
    state: "RULESET_CANDIDATE",
    worldGenerationRevision: revision,
    generatorVersion: "aurion.generator.v1",
    rulesetHash: sha("1"),
    grammarHash: sha("2"),
    seedPolicyVersion: "aurion.seed-policy.v1",
    canonicalGraphHash: sha("3"),
    chunkProjectionHashes: [sha("4"), sha("5")],
    terrainInvariantResults: [{ id: "terrain.height-bound", verdict: "MATCH", resultHash: sha("6") }],
    structureInvariantResults: [{ id: "structure.membership", verdict: "MATCH", resultHash: sha("7") }],
    cagVerification: { requestHash: sha("8"), responseHash: sha("9"), resultHash: sha("a"), verdict: "MATCH" },
    verificationVerdict: "MATCH",
    testSuiteIdentifiers: ["world-generation-passport.v1", "world-generation-parity.v1"],
    evidenceDeterminismHash: sha("b"),
    evidenceArtifactIntegrityHash: sha("c"),
    createdAt: "2026-09-27T03:00:00.000Z",
    ...overrides,
  };
  return createWorldGenerationEvidencePassport(base);
}
describe("Issue #602 world-generation evidence passport", () => {
  it("creates a deterministic, independently verifiable candidate passport", () => {
    const first = candidate();
    const second = candidate({ chunkProjectionHashes: [sha("5"), sha("4")] });
    expect(first.passportHash).toBe(second.passportHash);
    expect(verifyWorldGenerationEvidencePassport(first)).toBe(true);
    expect(verifyWorldGenerationEvidencePassport({ ...first, grammarHash: sha("f") })).toBe(false);
  });
  it("promotes only a complete candidate with matching CAG evidence", () => {
    const result = evaluateWorldGenerationRulesetPromotion(candidate());
    expect(result.verdict).toBe("PROMOTE");
    expect(result.state).toBe("RULESET_ACTIVE");
    expect(result.reason).toBeNull();
    const active = promoteWorldGenerationRuleset(candidate());
    expect(active.state).toBe("RULESET_ACTIVE");
    expect(verifyWorldGenerationEvidencePassport(active)).toBe(true);
  });
  it.each([
    ["verification", { verificationVerdict: "FIRST_DIVERGENCE" as const }, "VERIFICATION_NOT_MATCH"],
    ["cag verdict", { cagVerification: { requestHash: sha("8"), responseHash: sha("9"), resultHash: sha("a"), verdict: "FIRST_DIVERGENCE" as const } }, "CAG_NOT_MATCH"],
    ["cag hashes", { cagVerification: { requestHash: null, responseHash: null, resultHash: null, verdict: "MATCH" as const } }, "CAG_EVIDENCE_INCOMPLETE"],
    ["terrain", { terrainInvariantResults: [{ id: "terrain.height-bound", verdict: "FIRST_DIVERGENCE" as const, resultHash: sha("6") }] }, "TERRAIN_INVARIANT_NOT_PASS"],
    ["structure", { structureInvariantResults: [{ id: "structure.membership", verdict: "UNPROVABLE" as const, resultHash: sha("7") }] }, "STRUCTURE_INVARIANT_NOT_PASS"],
  ] as const)("holds promotion on %s failure", (_label, override, reason) => {
    const result = evaluateWorldGenerationRulesetPromotion(candidate(override));
    expect(result.verdict).toBe("HOLD");
    expect(result.reason).toBe(reason);
    expect(() => promoteWorldGenerationRuleset(candidate(override))).toThrow("WORLD_GENERATION_RULESET_PROMOTION_" + reason);
  });
  it("fails closed on CAG divergence and never treats it as active", () => {
    const passport = candidate({ cagVerification: { requestHash: sha("8"), responseHash: sha("9"), resultHash: sha("a"), verdict: "UNPROVABLE" } });
    expect(evaluateWorldGenerationRulesetPromotion(passport).state).toBe("RULESET_CANDIDATE");
  });
});
