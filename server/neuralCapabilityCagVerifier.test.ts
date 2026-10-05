import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  NEURAL_CAPABILITY_INVARIANT,
  computeArtifactSha256,
  evaluateNeuralCapabilityInvariants,
  type NeuralCapabilityDatasetEntry,
  type NeuralCapabilityEvaluationRecord,
  type NeuralCapabilityIntentContract,
} from "@shared/neuralCapabilityCagProtocol";
import {
  buildNeuralCapabilityCagProbe,
  verifyNeuralCapabilityWithCag,
} from "./neuralCapabilityCagVerifier";
import type { WolframCagClient, WolframCagEvidence } from "./wolframCag";

/**
 * Deterministic offline tests for the neural capability CAG oracle.
 * No Date.now, no Math.random, no network. The Wolfram client doubles below
 * are fixed fixtures returning canned bounded responses; production code paths
 * (configuration, hashing, invariant evaluation, parsing) run for real.
 */

const contract: NeuralCapabilityIntentContract = Object.freeze({
  specText: "Spieler darf nach einer Quest fragen, sie annehmen oder abgeben.",
  allowedIntents: Object.freeze(["accept_quest", "request_turn_in", "ask_quest_status", "reject"]),
  rejectIntent: "reject",
});

const cleanDataset: readonly NeuralCapabilityDatasetEntry[] = Object.freeze([
  Object.freeze({ input: "Kann ich die Quest annehmen?", intentLabel: "accept_quest" }),
  Object.freeze({ input: "Ich moechte die Quest abgeben.", intentLabel: "request_turn_in" }),
  Object.freeze({ input: "Wie weit bin ich mit der Quest?", intentLabel: "ask_quest_status" }),
  Object.freeze({ input: "asdf qwer", intentLabel: "reject" }),
]);

const cleanEvaluations: readonly NeuralCapabilityEvaluationRecord[] = Object.freeze([
  Object.freeze({ intent: "request_turn_in", questContextValid: true, confidenceBucket: "high", schemaValid: true, validatorResult: "accepted" }),
  Object.freeze({ intent: "reject", questContextValid: false, confidenceBucket: "low", schemaValid: true, validatorResult: "rejected" }),
]);

const artifactManifest = Object.freeze({
  capabilityId: "quest-intent-interpreter",
  format: "aurion.neural-artifact.v1",
  weights: "fixtures/quest-intent-weights.bin",
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

const cleanInput = Object.freeze({
  capabilityId: "quest-intent-interpreter",
  contract,
  dataset: cleanDataset,
  evaluations: cleanEvaluations,
  artifactManifest,
});

describe("verifyNeuralCapabilityWithCag", () => {
  it("returns MATCH when CAG independently re-aggregates the same invariant mask", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient("{0,9}") });
    expect(verification.status).toBe("MATCH");
    expect(verification.invariantMask).toBe(0);
    expect(verification.observedMask).toBe(0);
    expect(verification.protocol).toBe("aurion.neural-capability-cag.v1");
    expect(verification.artifactSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verification.specSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verification.datasetSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verification.cagEvidence).not.toBeNull();
  });

  it("returns FALSIFIED when CAG observes a different invariant mask", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient("{4,9}") });
    expect(verification.status).toBe("FALSIFIED");
    expect(verification.observedMask).toBe(4);
    expect(verification.invariantMask).toBe(0);
  });

  it("returns NOT_CONFIGURED without a provider key and performs no provider call", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { environment: {} });
    expect(verification.status).toBe("NOT_CONFIGURED");
    expect(verification.responseSha256).toBeNull();
    expect(verification.observedMask).toBeNull();
    expect(verification.cagEvidence).toBeNull();
  });

  it("returns PROVIDER_FAILED when the provider request fails", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: failingClient() });
    expect(verification.status).toBe("PROVIDER_FAILED");
    expect(verification.cagEvidence).toBeNull();
  });

  it("returns PROVIDER_FAILED on a malformed bounded response and preserves provider evidence", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient("not-a-bounded-result") });
    expect(verification.status).toBe("PROVIDER_FAILED");
    expect(verification.observedMask).toBeNull();
    expect(verification.responseSha256).not.toBeNull();
    expect(verification.cagEvidence?.result).toBe("not-a-bounded-result");
  });

  it("returns PROVIDER_FAILED when the provider mask exceeds the declared bit-vector bounds", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient("{512,9}") });
    expect(verification.status).toBe("PROVIDER_FAILED");
    expect(verification.observedMask).toBeNull();
    expect(verification.cagEvidence?.result).toBe("{512,9}");
  });

  it("fails closed on an artifact hash mismatch before any provider call", async () => {
    const wrong = "sha256:" + "0".repeat(64);
    await expect(verifyNeuralCapabilityWithCag(cleanInput, {
      client: fixedClient("{0,9}"),
      expectedHashes: { artifactSha256: wrong },
    })).rejects.toThrow("NEURAL_CAPABILITY_CAG_HASH_MISMATCH:artifactSha256");
  });

  it("accepts pinned hashes that match the recomputed provenance hashes", async () => {
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, {
      client: fixedClient("{0,9}"),
      expectedHashes: { artifactSha256: computeArtifactSha256(artifactManifest) },
    });
    expect(verification.status).toBe("MATCH");
  });

  it("detects dataset invariant violations and MATCHes on the flagged mask", async () => {
    const dirtyDataset: readonly NeuralCapabilityDatasetEntry[] = Object.freeze([
      ...cleanDataset,
      Object.freeze({ input: "Kann ich die Quest annehmen?", intentLabel: "accept_quest" }),
      Object.freeze({ input: "Unsinn", intentLabel: "fly_to_moon" }),
    ]);
    const local = evaluateNeuralCapabilityInvariants(contract, dirtyDataset, cleanEvaluations);
    expect(local.mask & NEURAL_CAPABILITY_INVARIANT.DATASET_UNKNOWN_LABEL).not.toBe(0);
    expect(local.mask & NEURAL_CAPABILITY_INVARIANT.DATASET_DUPLICATE_INPUT).not.toBe(0);
    const verification = await verifyNeuralCapabilityWithCag(
      { ...cleanInput, dataset: dirtyDataset },
      { client: fixedClient(`{${local.mask},9}`) },
    );
    expect(verification.status).toBe("MATCH");
    expect(verification.invariantMask).toBe(local.mask);
  });

  it("flags a high-confidence accepted intent with invalid quest context", async () => {
    const broken: readonly NeuralCapabilityEvaluationRecord[] = Object.freeze([
      Object.freeze({ intent: "request_turn_in", questContextValid: false, confidenceBucket: "high", schemaValid: true, validatorResult: "accepted" }),
    ]);
    const local = evaluateNeuralCapabilityInvariants(contract, cleanDataset, broken);
    expect(local.mask & NEURAL_CAPABILITY_INVARIANT.EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT).not.toBe(0);
  });

  it("returns INSUFFICIENT_EVIDENCE without dataset and evaluations, with no provider call", async () => {
    const verification = await verifyNeuralCapabilityWithCag(
      { ...cleanInput, dataset: Object.freeze([]), evaluations: Object.freeze([]) },
      { client: failingClient() },
    );
    expect(verification.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(verification.cagEvidence).toBeNull();
  });

  it("never carries mutation authority and never mutates its inputs", async () => {
    const before = JSON.stringify(cleanInput);
    const verification = await verifyNeuralCapabilityWithCag(cleanInput, { client: fixedClient("{0,9}") });
    expect(verification.mutationAuthority).toBe("none");
    expect(verification.localReport.mutationAuthority).toBe("none");
    expect(JSON.stringify(cleanInput)).toBe(before);
    expect(Object.isFrozen(verification)).toBe(true);
  });
});

describe("buildNeuralCapabilityCagProbe", () => {
  it("is deterministic and embeds the bounded bit vector only", () => {
    const report = evaluateNeuralCapabilityInvariants(contract, cleanDataset, cleanEvaluations);
    const first = buildNeuralCapabilityCagProbe(report);
    const second = buildNeuralCapabilityCagProbe(report);
    expect(first).toBe(second);
    expect(first).toContain("bits = {0,0,0,0,0,0,0,0,0}");
    expect(first).not.toContain(contract.specText);
  });
});
