import { readFileSync } from "node:fs";
import {
  canonicalize,
  computeArtifactSha256,
  computeDatasetSha256,
  computeSpecSha256,
  sha256Prefixed,
  type NeuralCapabilityDatasetEntry,
  type NeuralCapabilityEvaluationRecord,
  type NeuralCapabilityIntentContract,
} from "../../shared/neuralCapabilityCagProtocol";
import {
  buildNeuralCapabilityDifferentials,
  type NeuralCapabilityDifferentialCase,
} from "../../server/neuralCapabilityDifferentialHarness";
import { verifyNeuralCapabilityWithCag } from "../../server/neuralCapabilityCagVerifier";
import { evaluateNeuralCapabilityPromotionGate } from "../../server/neuralCapabilityPromotionGate";
import { wolframCagConfigurationStatus } from "../../server/wolframCag";

type BenchmarkFixture = Readonly<{
  protocol: "aurion.neural-capability-benchmark.v1";
  capabilityId: string;
  contract: NeuralCapabilityIntentContract;
  dataset: readonly NeuralCapabilityDatasetEntry[];
  evaluations: readonly NeuralCapabilityEvaluationRecord[];
  differentialCases: readonly NeuralCapabilityDifferentialCase[];
  artifactManifest: unknown;
}>;

const fixturePath = new URL("../../fixtures/neural-capability/quest-intent-cag.v1.json", import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as BenchmarkFixture;
if (fixture.protocol !== "aurion.neural-capability-benchmark.v1") {
  throw new Error("NEURAL_CAPABILITY_BENCHMARK_PROTOCOL");
}

const differentials = buildNeuralCapabilityDifferentials(fixture.differentialCases);
const capabilityId = fixture.capabilityId;
const specSha256 = computeSpecSha256(fixture.contract);
const datasetSha256 = computeDatasetSha256(fixture.dataset);
const artifactSha256 = computeArtifactSha256(fixture.artifactManifest);
const benchmarkSha256 = sha256Prefixed(canonicalize(fixture));

const configuration = wolframCagConfigurationStatus();
if (!configuration.configured) {
  process.stderr.write(`${JSON.stringify({
    protocol: "aurion.neural-capability-cag-ci.v2",
    status: "NOT_CONFIGURED",
    configurationState: configuration.configurationState,
    capabilityId,
    artifactSha256,
    specSha256,
    datasetSha256,
    benchmarkSha256,
    providerCallExecuted: false,
    promotionStatus: "BLOCKED",
    mutationAuthority: "none",
  })}\n`);
  process.exitCode = 2;
} else {
  try {
    const verification = await verifyNeuralCapabilityWithCag({
      capabilityId,
      contract: fixture.contract,
      dataset: fixture.dataset,
      evaluations: fixture.evaluations,
      differentials,
      artifactManifest: fixture.artifactManifest,
    });

    const promotion = evaluateNeuralCapabilityPromotionGate({
      verification,
      schemaValid: true,
      deterministicValid: verification.localReport.summary.differentialMismatchCount === 0,
      contextValid: !verification.localReport.diagnostics.some(diagnostic =>
        diagnostic.code === "EVALUATION_HIGH_CONFIDENCE_INVALID_CONTEXT"
        || diagnostic.code === "DATASET_CONTEXT_CONTRADICTION"
      ),
      offlineRuntimeValid: true,
      provenanceComplete: true,
      regressionPass: true,
    });

    const cagEvidenceSha256 = sha256Prefixed(canonicalize({
      requestSha256: verification.requestSha256,
      responseSha256: verification.responseSha256,
      observedMask: verification.observedMask,
      observedSummary: verification.observedSummary,
      resultHash: verification.localReport.resultHash,
    }));

    const verified =
      verification.status === "MATCH"
      && verification.invariantMask === 0
      && promotion.status === "PROMOTION_CANDIDATE";

    const ciStatus = verified
      ? "PROMOTION_CANDIDATE_VERIFIED"
      : verification.status === "PROVIDER_FAILED"
        ? "DESIGN_ORACLE_PROVIDER_FAILED"
        : verification.status === "NOT_CONFIGURED"
          ? "NOT_CONFIGURED"
          : verification.status === "INSUFFICIENT_EVIDENCE"
            ? "DESIGN_ORACLE_INSUFFICIENT_EVIDENCE"
            : "DESIGN_ORACLE_FALSIFIED";

    process.stdout.write(`${JSON.stringify({
      protocol: "aurion.neural-capability-cag-ci.v2",
      status: ciStatus,
      verificationStatus: verification.status,
      promotionStatus: promotion.status,
      promotionDimensions: promotion.dimensions,
      blockingDimensions: promotion.blockingDimensions,
      capabilityId,
      artifactSha256,
      specSha256,
      datasetSha256,
      benchmarkSha256,
      differentialCount: differentials.length,
      invariantMask: verification.invariantMask,
      invariantSummary: verification.localReport.summary,
      requestSha256: verification.requestSha256,
      responseSha256: verification.responseSha256,
      cagEvidenceSha256,
      providerCallExecuted: true,
      mutationAuthority: "none",
      activationAuthority: promotion.activationAuthority,
    })}\n`);
    process.exitCode = verified ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      protocol: "aurion.neural-capability-cag-ci.v2",
      status: "DESIGN_ORACLE_PROVIDER_FAILED",
      capabilityId,
      artifactSha256,
      specSha256,
      datasetSha256,
      benchmarkSha256,
      failure: error instanceof Error ? error.message : String(error),
      providerCallExecuted: true,
      promotionStatus: "BLOCKED",
      mutationAuthority: "none",
    })}\n`);
    process.exitCode = 1;
  }
}
