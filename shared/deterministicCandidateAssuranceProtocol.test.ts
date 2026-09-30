import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  assessDeterministicCandidate,
  optimizeDeterministicCandidates,
  replayDeterministicCandidates,
  verifyDeterministicCandidateAssurance,
  type CandidateAssuranceObservation,
  type CandidateSearchInput,
} from "./deterministicCandidateAssuranceProtocol";

const sourceRevision = "d".repeat(40);
const hash = (value: unknown) => canonicalSha256(value);

function candidate(id: string, scoreBps: number) {
  return {
    candidateId: id,
    sourceReceiptId: `receipt-${id}`,
    sourceReceiptHash: hash(["receipt", id]),
    inputHash: hash(["input", id]),
    outputHash: hash(["output", id]),
    parameterHash: hash(["parameter", id]),
    tieBreakKey: `tie-${id}`,
    scoreBps,
  };
}

const input: CandidateSearchInput = {
  sourceRevision,
  rulesetVersion: "candidate-ruleset-v1",
  decisionKey: "decision-677",
  candidates: [
    candidate("beta", 8_000),
    candidate("alpha", 8_000),
    candidate("gamma", 7_999),
  ],
  maxRounds: 8,
  stagnationLimit: 3,
};

function observations(
  status: CandidateAssuranceObservation["status"] = "MATCH"
): CandidateAssuranceObservation[] {
  return ["fidelity", "alignment", "compliance"].map(dimension => ({
    dimension: dimension as CandidateAssuranceObservation["dimension"],
    status,
    sourceRevision,
    receiptHash: hash([dimension, "receipt"]),
    replayHash: hash([dimension, "replay"]),
    readbackHash: hash([dimension, "readback"]),
    summary: `${dimension.toUpperCase()}_EVIDENCE_MATCH`,
  }));
}

describe("Issue #677 deterministic candidate optimization and assurance", () => {
  it("selects a stable tie-break winner and records bounded stagnation", () => {
    const result = optimizeDeterministicCandidates(input);
    expect(result.selectedCandidateId).toBe("alpha");
    expect(result.selectedScoreBps).toBe(8_000);
    expect(result.stopReason).toBe("STAGNATION");
    expect(result.rounds).toHaveLength(4);
    expect(result.mutationAuthority).toBe("none");
  });

  it("is invariant under candidate input ordering and replays exactly", () => {
    const first = optimizeDeterministicCandidates(input);
    const reordered = optimizeDeterministicCandidates({
      ...input,
      candidates: [...input.candidates].reverse(),
    });
    expect(reordered).toEqual(first);
    expect(replayDeterministicCandidates(input, first)).toBe(true);
    expect(
      replayDeterministicCandidates(
        { ...input, rulesetVersion: "candidate-ruleset-v2" },
        first
      )
    ).toBe(false);
  });

  it("binds every candidate to receipts, hashes, revision and bounded fixed-point scores", () => {
    expect(() =>
      optimizeDeterministicCandidates({
        ...input,
        candidates: [candidate("alpha", 10_001)],
      })
    ).toThrow("CANDIDATE_SCORE_INVALID");
    expect(() =>
      optimizeDeterministicCandidates({
        ...input,
        candidates: [candidate("alpha", 8_000), candidate("alpha", 7_000)],
      })
    ).toThrow("CANDIDATE_ID_DUPLICATE");
    expect(() =>
      optimizeDeterministicCandidates({
        ...input,
        sourceRevision: "e".repeat(40),
      })
    ).not.toThrow();
    expect(() =>
      optimizeDeterministicCandidates({ ...input, candidates: [] })
    ).toThrow("CANDIDATE_SET_BOUND_INVALID");
  });

  it("produces a verifiable assurance result only from all three evidence dimensions", () => {
    const search = optimizeDeterministicCandidates(input);
    const assurance = assessDeterministicCandidate({
      search,
      observations: observations(),
    });
    expect(assurance.status).toBe("VERIFIED");
    expect(verifyDeterministicCandidateAssurance(assurance)).toBe(true);
    expect(
      verifyDeterministicCandidateAssurance({
        ...assurance,
        assuranceHash: hash("tampered"),
      })
    ).toBe(false);
  });

  it("preserves contradiction and marks missing evidence unprovable", () => {
    const search = optimizeDeterministicCandidates(input);
    const contradicted = assessDeterministicCandidate({
      search,
      observations: observations("CONTRADICTED"),
    });
    expect(contradicted.status).toBe("CONTRADICTED");
    const missing = observations("UNVERIFIED").map(observation => ({
      ...observation,
      receiptHash: null,
      replayHash: null,
      readbackHash: null,
    }));
    const unprovable = assessDeterministicCandidate({
      search,
      observations: missing,
    });
    expect(unprovable.status).toBe("UNPROVABLE");
  });

  it("rejects mixed revisions and incomplete assurance dimensions", () => {
    const search = optimizeDeterministicCandidates(input);
    expect(() =>
      assessDeterministicCandidate({
        search,
        observations: observations().map((item, index) =>
          index === 0 ? { ...item, sourceRevision: "e".repeat(40) } : item
        ),
      })
    ).toThrow("ASSURANCE_REVISION_MISMATCH:fidelity");
    expect(() =>
      assessDeterministicCandidate({
        search,
        observations: observations().slice(0, 2),
      })
    ).toThrow("ASSURANCE_DIMENSION_SET_INCOMPLETE");
  });
});
