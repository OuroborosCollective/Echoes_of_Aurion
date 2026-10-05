import {
  computeArtifactSha256,
  computeDatasetSha256,
  computeSpecSha256,
  type NeuralCapabilityDatasetEntry,
  type NeuralCapabilityEvaluationRecord,
  type NeuralCapabilityIntentContract,
} from "../../shared/neuralCapabilityCagProtocol";
import { verifyNeuralCapabilityWithCag } from "../../server/neuralCapabilityCagVerifier";
import { wolframCagConfigurationStatus } from "../../server/wolframCag";
import { sha256Prefixed, canonicalize } from "../../shared/neuralCapabilityCagProtocol";

/**
 * CI canary for the neural capability CAG design oracle (AIM #717).
 *
 * Runs a fixed, fully deterministic fixture through the real verifier against
 * the real provider. No Date.now, no Math.random, no mock evidence: without a
 * configured provider key the canary exits 2 with NOT_CONFIGURED instead of
 * fabricating evidence. A FALSIFIED or PROVIDER_FAILED result blocks only the
 * promotion gate (exit 1), never a running server.
 */

const fixtureContract: NeuralCapabilityIntentContract = Object.freeze({
  specText: "Spieler darf nach einer Quest fragen, sie annehmen oder abgeben.",
  allowedIntents: Object.freeze(["accept_quest", "request_turn_in", "ask_quest_status", "reject"]),
  rejectIntent: "reject",
});

const fixtureDataset: readonly NeuralCapabilityDatasetEntry[] = Object.freeze([
  Object.freeze({ input: "Kann ich die Quest annehmen?", intentLabel: "accept_quest" }),
  Object.freeze({ input: "Ich moechte die Quest abgeben.", intentLabel: "request_turn_in" }),
  Object.freeze({ input: "Wie weit bin ich mit der Quest?", intentLabel: "ask_quest_status" }),
  Object.freeze({ input: "asdf qwer", intentLabel: "reject" }),
]);

const fixtureEvaluations: readonly NeuralCapabilityEvaluationRecord[] = Object.freeze([
  Object.freeze({ intent: "request_turn_in", questContextValid: true, confidenceBucket: "high", schemaValid: true, validatorResult: "accepted" }),
  Object.freeze({ intent: "reject", questContextValid: false, confidenceBucket: "low", schemaValid: true, validatorResult: "rejected" }),
]);

const fixtureArtifactManifest = Object.freeze({
  capabilityId: "quest-intent-interpreter",
  format: "aurion.neural-artifact.v1",
  weights: "fixtures/quest-intent-weights.bin",
});

const capabilityId = "quest-intent-interpreter";
const specSha256 = computeSpecSha256(fixtureContract);
const datasetSha256 = computeDatasetSha256(fixtureDataset);
const artifactSha256 = computeArtifactSha256(fixtureArtifactManifest);

const configuration = wolframCagConfigurationStatus();
if (!configuration.configured) {
  process.stderr.write(`${JSON.stringify({
    protocol: "aurion.neural-capability-cag-ci.v1",
    status: "NOT_CONFIGURED",
    configurationState: configuration.configurationState,
    capabilityId,
    artifactSha256,
    specSha256,
    datasetSha256,
    providerCallExecuted: false,
    mutationAuthority: "none",
  })}\n`);
  process.exitCode = 2;
} else {
  try {
    const verification = await verifyNeuralCapabilityWithCag({
      capabilityId,
      contract: fixtureContract,
      dataset: fixtureDataset,
      evaluations: fixtureEvaluations,
      artifactManifest: fixtureArtifactManifest,
    });
    const cagEvidenceSha256 = sha256Prefixed(canonicalize({
      requestSha256: verification.requestSha256,
      responseSha256: verification.responseSha256,
      observedMask: verification.observedMask,
      resultHash: verification.localReport.resultHash,
    }));
    const verified = verification.status === "MATCH" && verification.invariantMask === 0;
    process.stdout.write(`${JSON.stringify({
      protocol: "aurion.neural-capability-cag-ci.v1",
      status: verified ? "DESIGN_ORACLE_VERIFIED" : "DESIGN_ORACLE_FALSIFIED",
      verificationStatus: verification.status,
      capabilityId,
      artifactSha256,
      specSha256,
      datasetSha256,
      invariantMask: verification.invariantMask,
      requestSha256: verification.requestSha256,
      responseSha256: verification.responseSha256,
      cagEvidenceSha256,
      providerCallExecuted: true,
      mutationAuthority: "none",
    })}\n`);
    process.exitCode = verified ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      protocol: "aurion.neural-capability-cag-ci.v1",
      status: "DESIGN_ORACLE_PROVIDER_FAILED",
      capabilityId,
      artifactSha256,
      specSha256,
      datasetSha256,
      failure: error instanceof Error ? error.message : String(error),
      providerCallExecuted: true,
      mutationAuthority: "none",
    })}\n`);
    process.exitCode = 1;
  }
}
