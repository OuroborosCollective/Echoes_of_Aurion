import { describe, expect, it } from "vitest";
import type { NeuralCapabilityCagVerification } from "./neuralCapabilityCagVerifier";
import { evaluateNeuralCapabilityPromotionGate } from "./neuralCapabilityPromotionGate";

const verification: NeuralCapabilityCagVerification = Object.freeze({
  protocol: "aurion.neural-capability-cag.v1",
  capabilityId: "quest-intent-interpreter",
  artifactSha256: "sha256:" + "a".repeat(64),
  specSha256: "sha256:" + "b".repeat(64),
  datasetSha256: "sha256:" + "c".repeat(64),
  status: "MATCH",
  invariantMask: 0,
  requestSha256: "sha256:" + "d".repeat(64),
  responseSha256: "e".repeat(64),
  observedMask: 0,
  mutationAuthority: "none",
  sourceBoundary: "bounded_spec_hash_dataset_differential",
  observedSummary: Object.freeze({
    specMissingCount: 0,
    datasetConflictCount: 0,
    nearDuplicateConflictCount: 0,
    contextContradictionCount: 0,
    differentialMismatchCount: 0,
  }),
  cagEvidence: null,
  localReport: Object.freeze({
    protocol: "aurion.neural-capability-invariants.v1",
    mask: 0,
    diagnostics: Object.freeze([]),
    summary: Object.freeze({
      specMissingCount: 0,
      datasetConflictCount: 0,
      nearDuplicateConflictCount: 0,
      contextContradictionCount: 0,
      differentialMismatchCount: 0,
    }),
    resultHash: "sha256:" + "f".repeat(64),
    mutationAuthority: "none",
  }),
});

const green = Object.freeze({
  verification,
  schemaValid: true,
  deterministicValid: true,
  contextValid: true,
  offlineRuntimeValid: true,
  provenanceComplete: true,
  regressionPass: true,
});

describe("neural capability promotion gate", () => {
  it("marks an all-green evidence vector as a candidate without activation authority", () => {
    const report = evaluateNeuralCapabilityPromotionGate(green);
    expect(report.status).toBe("PROMOTION_CANDIDATE");
    expect(report.blockingDimensions).toEqual([]);
    expect(report.activationAuthority).toBe("none");
  });

  it("blocks on any missing evidence dimension", () => {
    for (const key of ["schemaValid", "deterministicValid", "contextValid", "offlineRuntimeValid", "provenanceComplete", "regressionPass"] as const) {
      const report = evaluateNeuralCapabilityPromotionGate({ ...green, [key]: false });
      expect(report.status).toBe("BLOCKED");
      expect(report.blockingDimensions.length).toBeGreaterThan(0);
    }
  });

  it("blocks a CAG falsification and never treats provider absence as promotion", () => {
    expect(evaluateNeuralCapabilityPromotionGate({
      ...green,
      verification: { ...verification, status: "FALSIFIED", observedMask: 1 },
    }).dimensions.cagInvariants).toBe(false);
    expect(evaluateNeuralCapabilityPromotionGate({
      ...green,
      verification: { ...verification, status: "NOT_CONFIGURED", observedMask: null },
    }).status).toBe("BLOCKED");
  });

  it("blocks dataset/spec/differential defects even if a caller sets other booleans true", () => {
    const broken = {
      ...verification,
      invariantMask: 512,
      localReport: {
        ...verification.localReport,
        mask: 512,
        summary: { ...verification.localReport.summary, specMissingCount: 1 },
      },
    } as NeuralCapabilityCagVerification;
    const report = evaluateNeuralCapabilityPromotionGate({ ...green, verification: broken });
    expect(report.status).toBe("BLOCKED");
    expect(report.blockingDimensions).toContain("cagInvariants");
  });
});
