import type { NeuralCapabilityCagVerification } from "./neuralCapabilityCagVerifier";

export const AURION_NEURAL_CAPABILITY_PROMOTION_PROTOCOL = "aurion.neural-capability-promotion.v1" as const;

export type NeuralCapabilityPromotionDimensions = Readonly<{
  schemaValid: boolean;
  deterministicValid: boolean;
  contextValid: boolean;
  datasetCoverage: boolean;
  cagInvariants: boolean;
  offlineRuntime: boolean;
  provenanceComplete: boolean;
  regressionPass: boolean;
}>;

export type NeuralCapabilityPromotionGateInput = Readonly<{
  verification: NeuralCapabilityCagVerification;
  schemaValid: boolean;
  deterministicValid: boolean;
  contextValid: boolean;
  offlineRuntimeValid: boolean;
  provenanceComplete: boolean;
  regressionPass: boolean;
}>;

export type NeuralCapabilityPromotionGateReport = Readonly<{
  protocol: typeof AURION_NEURAL_CAPABILITY_PROMOTION_PROTOCOL;
  capabilityId: string;
  artifactSha256: string;
  specSha256: string;
  datasetSha256: string;
  status: "PROMOTION_CANDIDATE" | "BLOCKED";
  dimensions: NeuralCapabilityPromotionDimensions;
  blockingDimensions: readonly (keyof NeuralCapabilityPromotionDimensions)[];
  activationAuthority: "none";
}>;

/**
 * Pure promotion decision. It can mark a build artifact as a candidate, but it
 * cannot activate, deploy, mutate gameplay, or alter persistence.
 */
export function evaluateNeuralCapabilityPromotionGate(
  input: NeuralCapabilityPromotionGateInput,
): NeuralCapabilityPromotionGateReport {
  const report = input.verification.localReport;
  const dimensions: NeuralCapabilityPromotionDimensions = Object.freeze({
    schemaValid: input.schemaValid,
    deterministicValid: input.deterministicValid,
    contextValid: input.contextValid,
    datasetCoverage:
      report.summary.datasetConflictCount === 0
      && report.summary.nearDuplicateConflictCount === 0
      && report.summary.contextContradictionCount === 0
      && !report.diagnostics.some(diagnostic =>
        diagnostic.code === "DATASET_COVERAGE_GAP"
        || diagnostic.code === "DATASET_UNKNOWN_LABEL"
        || diagnostic.code === "DATASET_MISSING_REJECT_EXAMPLES"
      ),
    cagInvariants:
      input.verification.status === "MATCH"
      && input.verification.invariantMask === 0
      && input.verification.observedMask === 0
      && report.summary.specMissingCount === 0
      && report.summary.differentialMismatchCount === 0,
    offlineRuntime: input.offlineRuntimeValid,
    provenanceComplete:
      input.provenanceComplete
      && input.verification.artifactSha256.startsWith("sha256:")
      && input.verification.specSha256.startsWith("sha256:")
      && input.verification.datasetSha256.startsWith("sha256:"),
    regressionPass: input.regressionPass,
  });
  const blockingDimensions = Object.freeze(
    (Object.keys(dimensions) as (keyof NeuralCapabilityPromotionDimensions)[])
      .filter(dimension => !dimensions[dimension]),
  );
  return Object.freeze({
    protocol: AURION_NEURAL_CAPABILITY_PROMOTION_PROTOCOL,
    capabilityId: input.verification.capabilityId,
    artifactSha256: input.verification.artifactSha256,
    specSha256: input.verification.specSha256,
    datasetSha256: input.verification.datasetSha256,
    status: blockingDimensions.length === 0 ? "PROMOTION_CANDIDATE" : "BLOCKED",
    dimensions,
    blockingDimensions,
    activationAuthority: "none",
  });
}
