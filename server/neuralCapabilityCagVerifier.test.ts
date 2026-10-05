import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  NEURAL_CAPABILITY_INVARIANT,
  NEURAL_CAPABILITY_INVARIANT_CODES,
  computeArtifactSha256,
  evaluateNeuralCapabilityInvariants,
  type NeuralCapabilityDatasetEntry,
  type NeuralCapabilityDifferentialRecord,
  type NeuralCapabilityEvaluationRecord,
  type NeuralCapabilityIntentContract,
  type NeuralCapabilityInvariantReport,
} from "@shared/neuralCapabilityCagProtocol";
import {
  buildNeuralCapabilityCagProbe,
  verifyNeuralCapabilityWithCag,
} from "./neuralCapabilityCagVerifier";
import type { WolframCagClient, WolframCagEvidence } from "./wolframCag";

const contract: NeuralCapabilityIntentContract = Object.freeze({
  specText: "Spieler darf nach einer Quest fragen, sie annehmen oder abgeben.",
  allowedIntents: Object.freeze(["accept_quest", "request_turn_in", "ask_quest_status", "reject"]),
  rejectIntent: "reject",
  specIntentAliases: Object.freeze({
    accept_quest: Object.freeze(["annehmen"]),
    request_turn_in: Object.freeze(["abgeben"]),
    ask_quest_status: Object.freeze(["nach einer quest fragen"]),
  }),
});

const cleanDataset: readonly NeuralCapabilityDatasetEntry[] = Object.freeze([
  Object.freeze({ input: "Kann ich die Quest annehmen?", intentLabel: "accept_quest", contextKey: "lyra:astral", contextValid: true }),
  Object.freeze({ input: "Ich moechte die Quest abgeben.", intentLabel: "request_turn_in", contextKey: "lyra:astral", contextValid: true }),
  Object.freeze({ input: "Wie weit bin ich mit der Quest?", intentLabel: "ask_quest_status", contextKey: "lyra:astral", contextValid: true }),
  Object.freeze({ input: "asdf qwer", intentLabel: "reject", contextKey: "none", contextValid: false }),
]);

const cleanEvaluations: readonly NeuralCapabilityEvaluationRecord[] = Object.freeze([
  Object.freeze({ intent: "request_turn_in", questContextValid: true, confidenceBucket: "high", schemaValid: true, validatorResult: "accepted" }),
  Object.freeze({ intent: "reject", questContextValid: false, confidenceBucket: "low", schemaValid: true, validatorResult: "rejected" }),
]);

const cleanDifferentials: readonly NeuralCapabilityDifferentialRecord[] = Object.freeze([
  Object.freeze({
    caseId: "clean-accept",
    expected: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
    legacy: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
    neural: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
  }),
  Object.freeze({
    caseId: "clean-reject",
    expected: Object.freeze({ intent: "reject", questContextValid: false, validatorResult: "rejected" }),
    legacy: Object.freeze({ intent: "reject", questContextValid: false, validatorResult: "rejected" }),
    neural: Object.freeze({ intent: "reject", questContextValid: false, validatorResult: "rejected" }),
  }),
]);

const artifactManifest = Object.freeze({
  capabilityId: "quest-intent-interpreter",
  format: "aurion.neural-artifact.v1",
  runtimeNetwork: "forbidden",
});

function cannedEvidence(result: string): WolframCagEvidence {
  return Object.freeze({
    protocol: "aurion.wolfram-cag.v1",
    provider: "wolfram-cag",
    component: "language_compute",
    endpoint: "/api/cag/v1/WolframLanguageCompute",
    requestSha256: createHash("sha256").update("fixture-request", "utf8").digest("hex"),
    responseSha256: createHash("sha256").update(result, "utf8").digest("hex"),
    providerUuid: null,
    providerCode: 200,
    success: true,
    result,
    resultChars: result.length,
  });
}

function fixedClient(result: string): WolframCagClient {
  return Object.freeze({
    languageCompute: async () => cannedEvidence(result),
    languageHints: async () => { throw new Error("not used"); },
    alphaResults: async () => { throw new Error("not used"); },
    alphaContext: async () => { throw new Error("not used"); },
  });
}

function failingClient(): WolframCagClient {
  return Object.freeze({
    languageCompute: async () => { throw new Error("WOLFRAM_CAG_HTTP_503"); },
    languageHints: async () => { throw new Error("not used"); },
    alphaResults: async () => { throw new Error("not used"); },
    alphaContext: async () => { throw new Error("not used"); },
  });
}

function responseFor(report: NeuralCapabilityInvariantReport): string {
  const s = report.summary;
  return `{${report.mask},${NEURAL_CAPABILITY_INVARIANT_CODES.length},${s.specMissingCount},${s.datasetConflictCount},${s.nearDuplicateConflictCount},${s.contextContradictionCount},${s.differentialMismatchCount}}`;
}

const cleanInput = Object.freeze({
  capabilityId: "quest-intent-interpreter",
  contract,
  dataset: cleanDataset,
  evaluations: cleanEvaluations,
  differentials: cleanDifferentials,
  artifactManifest,
});

describe("verifyNeuralCapabilityWithCag", () => {
  it("MATCHes a clean independently recomputed bounded report", async () => {
    const local = evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations, cleanDifferentials);
    expect(local.mask).toBe(0);
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient(responseFor(local)) });
    expect(verification.status).toBe("MATCH");
    expect(verification.observedSummary).toEqual(local.summary);
    expect(verification.sourceBoundary).toBe("bounded_spec_hash_dataset_differential");
  });

  it("FALSIFIES when CAG observes a different mask", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, {
      client: fixedClient(`{4,${NEURAL_CAPABILITY_INVARIANT_CODES.length},0,0,0,0,0}`),
    });
    expect(verification.status).toBe("FALSIFIED");
    expect(verification.observedMask).toBe(4);
  });

  it("returns NOT_CONFIGURED and PROVIDER_FAILED without inventing evidence", async () => {
    expect((await verifyNeuralCapabilityWithCag(cleanInput, { environment: {} })).status).toBe("NOT_CONFIGURED");
    expect((await verifyNeuralCapabilityWithCag(cleanInput, { client: failingClient() })).status).toBe("PROVIDER_FAILED");
  });

  it("preserves malformed provider evidence but refuses to trust it", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient("not-a-bounded-result") });
    expect(verification.status).toBe("PROVIDER_FAILED");
    expect(verification.observedMask).toBeNull();
    expect(verification.cagEvidence?.result).toBe("not-a-bounded-result");
  });

  it("fails closed on pinned provenance mismatch before provider access", async () => {
    await expect(verifyNeuralCapabilityWithCag(cleanInput, {
      client: fixedClient("unused"),
      expectedHashes: { artifactSha256: "sha256:" + "0".repeat(64) },
    })).rejects.toThrow("NEURAL_CAPABILITY_CAG_HASH_MISMATCH:artifactSha256");
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, {
      client: fixedClient(responseFor(evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations, cleanDifferentials))),
      expectedHashes: { artifactSha256: computeArtifactSha256(artifactManifest) },
    });
    expect(verification.status).toBe("MATCH");
  });

  it("detects missing spec grounding and spec/DSL disagreement", () => {
    const missingAliases = { ...contract, specIntentAliases: { accept_quest: ["annehmen"] } };
    const report = evaluateNeuralCapabilityInvariants(missingAliases, cleanDataset, cleanEvaluations, cleanDifferentials);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.CONTRACT_SPEC_GROUNDING_MISSING).not.toBe(0);

    const unmentioned = { ...contract, specIntentAliases: { ...contract.specIntentAliases, request_turn_in: ["zerstoeren"] } };
    const report2 = evaluateNeuralCapabilityInvariants(unmentioned, cleanDataset, cleanEvaluations, cleanDifferentials);
    expect(report2.mask & NEURAL_CAPABILITY_INVARIANT.CONTRACT_SPEC_INTENT_UNMENTIONED).not.toBe(0);
  });

  it("detects exact-label, near-duplicate and context contradictions", () => {
    const dirty: readonly NeuralCapabilityDatasetEntry[] = Object.freeze([
      ...cleanDataset,
      Object.freeze({ input: "Kann ich die Quest annehmen?", intentLabel: "request_turn_in", contextKey: "lyra:astral", contextValid: true }),
      Object.freeze({ input: "Kann ich die Quest---annehmen?", intentLabel: "request_turn_in", contextKey: "other", contextValid: true }),
      Object.freeze({ input: "Ich moechte die Quest abgeben.", intentLabel: "request_turn_in", contextKey: "lyra:astral", contextValid: false }),
    ]);
    const report = evaluateNeuralCapabilityInvariants(contract, dirty, cleanEvaluations, cleanDifferentials);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DATASET_CONFLICTING_LABEL).not.toBe(0);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DATASET_NEAR_DUPLICATE_CONFLICT).not.toBe(0);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DATASET_CONTEXT_CONTRADICTION).not.toBe(0);
  });

  it("detects legacy/neural decision, intent, context and expectation drift", () => {
    const dirty: readonly NeuralCapabilityDifferentialRecord[] = Object.freeze([
      Object.freeze({
        caseId: "decision",
        expected: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
        legacy: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
        neural: Object.freeze({ intent: "reject", questContextValid: false, validatorResult: "rejected" }),
      }),
      Object.freeze({
        caseId: "intent",
        expected: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
        legacy: Object.freeze({ intent: "request_turn_in", questContextValid: true, validatorResult: "accepted" }),
        neural: Object.freeze({ intent: "accept_quest", questContextValid: true, validatorResult: "accepted" }),
      }),
    ]);
    const report = evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations, dirty);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_DECISION_MISMATCH).not.toBe(0);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_ACCEPTED_INTENT_MISMATCH).not.toBe(0);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_CONTEXT_MISMATCH).not.toBe(0);
    expect(report.mask & NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_EXPECTATION_MISMATCH).not.toBe(0);
    expect(report.summary.differentialMismatchCount).toBe(2);
  });

  it("returns INSUFFICIENT_EVIDENCE only when dataset, evaluations and differentials are all empty", async () => {
    const verification = await verifyNeuralCapabilityWithCag(
      { ...cleanInput, dataset: [], evaluations: [], differentials: [] },
      { client: failingClient() },
    );
    expect(verification.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("never mutates inputs or grants mutation authority", async () => {
    const before = JSON.stringify(cleanInput);
    const local = evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations, cleanDifferentials);
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient(responseFor(local)) });
    expect(verification.mutationAuthority).toBe("none");
    expect(verification.localReport.mutationAuthority).toBe("none");
    expect(JSON.stringify(cleanInput)).toBe(before);
  });
});

describe("buildNeuralCapabilityCagProbe", () => {
  it("is deterministic, excludes dataset text and includes bounded spec aliases plus hashed dataset rows", () => {
    const report = evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations, cleanDifferentials);
    const first = buildNeuralCapabilityCagProbe(report, cleanInput);
    expect(buildNeuralCapabilityCagProbe(report, cleanInput)).toBe(first);
    expect(first).toContain("annehmen");
    expect(first).not.toContain("Kann ich die Quest annehmen?");
    expect(first).toContain("sha256:");
  });

  it("enforces bounded CAG input sizes", () => {
    const oversized = { ...contract, specText: "x".repeat(2049) };
    const report = evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations, cleanDifferentials);
    expect(() => buildNeuralCapabilityCagProbe(report, { ...cleanInput, contract: oversized })).toThrow("NEURAL_CAPABILITY_CAG_INPUT_BOUNDS");
  });
});
