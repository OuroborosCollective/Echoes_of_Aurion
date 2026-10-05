import {
  AURION_NEURAL_CAPABILITY_CAG_PROTOCOL,
  AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
  NEURAL_CAPABILITY_INVARIANT_CODES,
  computeArtifactSha256,
  computeDatasetSha256,
  computeSpecSha256,
  evaluateNeuralCapabilityInvariants,
  isSha256Prefixed,
  neuralCapabilityInvariantBitVector,
  sha256Prefixed,
  type NeuralCapabilityCagReport,
  type NeuralCapabilityDatasetEntry,
  type NeuralCapabilityEvaluationRecord,
  type NeuralCapabilityIntentContract,
  type NeuralCapabilityInvariantReport,
} from "@shared/neuralCapabilityCagProtocol";
import { normalizeWolframComputeResult } from "./aurionCagDesignOracle";
import {
  requireWolframCagClient,
  wolframCagConfigurationStatus,
  type WolframCagClient,
  type WolframCagEvidence,
} from "./wolframCag";

/**
 * CAG/Wolfram falsification and evaluation oracle for the LLM-free neural
 * capability layer (AIM #717).
 *
 * Follows the worldGenerationGraphCagVerifier pattern:
 * local deterministic report -> bounded CAG probe -> MATCH/FALSIFIED -> evidence.
 *
 * Hard boundaries:
 * - Offline/CI/promotion path only; the runtime never imports this module.
 * - CAG receives only bounded, structured data (bit vector + counts).
 * - CAG has no mutation authority and cannot activate or block a running server;
 *   a FALSIFIED result only blocks promotion of the inspected artifact.
 */
export type NeuralCapabilityCagVerificationInput = Readonly<{
  capabilityId: string;
  contract: NeuralCapabilityIntentContract;
  dataset: readonly NeuralCapabilityDatasetEntry[];
  evaluations: readonly NeuralCapabilityEvaluationRecord[];
  /** Deterministic artifact manifest; hashed canonically, never sent to CAG. */
  artifactManifest: unknown;
}>;

export type NeuralCapabilityCagVerificationOptions = Readonly<{
  client?: WolframCagClient;
  environment?: NodeJS.ProcessEnv;
  /** Optional caller-pinned hashes; a mismatch fails before any provider call. */
  expectedHashes?: Readonly<{
    artifactSha256?: string;
    specSha256?: string;
    datasetSha256?: string;
  }>;
}>;

export type NeuralCapabilityCagVerification = NeuralCapabilityCagReport &
  Readonly<{
    localReport: NeuralCapabilityInvariantReport;
    cagEvidence: WolframCagEvidence | null;
    sourceBoundary: "bounded_invariant_bit_vector";
  }>;

function verifyPinnedHashes(computed: Readonly<{ artifactSha256: string; specSha256: string; datasetSha256: string }>, expected: NeuralCapabilityCagVerificationOptions["expectedHashes"]): void {
  if (!expected) return;
  const pairs = [
    ["artifactSha256", expected.artifactSha256, computed.artifactSha256],
    ["specSha256", expected.specSha256, computed.specSha256],
    ["datasetSha256", expected.datasetSha256, computed.datasetSha256],
  ] as const;
  for (const [field, wanted, actual] of pairs) {
    if (wanted === undefined) continue;
    if (!isSha256Prefixed(wanted) || wanted !== actual) {
      throw new Error(`NEURAL_CAPABILITY_CAG_HASH_MISMATCH:${field}`);
    }
  }
}

function escapeComment(value: string): string {
  return value.replace(/\(\*/g, "(/").replace(/\*\)/g, "/)");
}

/** Bounded Wolfram probe: independently re-aggregates the mask from the bit vector. */
export function buildNeuralCapabilityCagProbe(report: NeuralCapabilityInvariantReport): string {
  const bits = neuralCapabilityInvariantBitVector(report);
  const payload = escapeComment(JSON.stringify({
    protocol: AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
    diagnosticCount: report.diagnostics.length,
    resultHash: report.resultHash,
  }));
  return [
    "Module[{bits, mask},",
    " bits = {" + bits.join(",") + "};",
    " mask = Total[bits * 2^Range[0, Length[bits] - 1]];",
    " {mask, Length[bits]}",
    "]",
    "(* " + payload + " *)",
  ].join("\n");
}

function parseProbeResult(value: string, expectedBitCount: number): number {
  const normalized = normalizeWolframComputeResult(value);
  const match = /^\{(-?[0-9]+),(-?[0-9]+)\}$/.exec(normalized);
  if (!match) throw new Error("NEURAL_CAPABILITY_CAG_RESULT_FORMAT");
  const mask = Number(match[1]);
  const bitCount = Number(match[2]);
  if (!Number.isSafeInteger(mask) || !Number.isSafeInteger(bitCount) || mask < 0) {
    throw new Error("NEURAL_CAPABILITY_CAG_RESULT_BOUNDS");
  }
  if (bitCount !== expectedBitCount) {
    throw new Error("NEURAL_CAPABILITY_CAG_RESULT_BIT_COUNT");
  }
  const maxMask = (2 ** expectedBitCount) - 1;
  if (mask > maxMask) {
    throw new Error("NEURAL_CAPABILITY_CAG_RESULT_BOUNDS");
  }
  return mask;
}

export async function verifyNeuralCapabilityWithCag(
  input: NeuralCapabilityCagVerificationInput,
  options: NeuralCapabilityCagVerificationOptions = {},
): Promise<NeuralCapabilityCagVerification> {
  const localReport = evaluateNeuralCapabilityInvariants(input.contract, input.dataset, input.evaluations);
  const artifactSha256 = computeArtifactSha256(input.artifactManifest);
  const specSha256 = computeSpecSha256(input.contract);
  const datasetSha256 = computeDatasetSha256(input.dataset);
  verifyPinnedHashes({ artifactSha256, specSha256, datasetSha256 }, options.expectedHashes);

  const code = buildNeuralCapabilityCagProbe(localReport);
  const requestSha256 = sha256Prefixed("aurion.neural-capability-cag-request.v1::" + code);

  const base = {
    protocol: AURION_NEURAL_CAPABILITY_CAG_PROTOCOL,
    capabilityId: input.capabilityId,
    artifactSha256,
    specSha256,
    datasetSha256,
    invariantMask: localReport.mask,
    requestSha256,
    mutationAuthority: "none" as const,
    localReport,
    sourceBoundary: "bounded_invariant_bit_vector" as const,
  };
  const finish = (
    status: NeuralCapabilityCagVerification["status"],
    responseSha256: string | null,
    observedMask: number | null,
    cagEvidence: WolframCagEvidence | null,
  ): NeuralCapabilityCagVerification => Object.freeze({ ...base, status, responseSha256, observedMask, cagEvidence });

  // Nothing analyzable: no dataset and no neural outputs means CAG evidence
  // could not discriminate anything even if the provider answered.
  if (input.dataset.length === 0 && input.evaluations.length === 0) {
    return finish("INSUFFICIENT_EVIDENCE", null, null, null);
  }

  let client = options.client;
  if (!client) {
    const configuration = wolframCagConfigurationStatus(options.environment ?? process.env);
    if (!configuration.configured) return finish("NOT_CONFIGURED", null, null, null);
    try {
      client = requireWolframCagClient(options.environment ?? process.env);
    } catch {
      return finish("PROVIDER_FAILED", null, null, null);
    }
  }

  let evidence: WolframCagEvidence;
  try {
    evidence = await client.languageCompute({ code, timeConstraint: 10, maxChars: 512 });
  } catch {
    return finish("PROVIDER_FAILED", null, null, null);
  }

  try {
    const observedMask = parseProbeResult(evidence.result, NEURAL_CAPABILITY_INVARIANT_CODES.length);
    return finish(observedMask === localReport.mask ? "MATCH" : "FALSIFIED", evidence.responseSha256, observedMask, evidence);
  } catch {
    // Preserve provider evidence for forensic debugging even when its bounded
    // response cannot be trusted as a valid mask.
    return finish("PROVIDER_FAILED", evidence.responseSha256, null, evidence);
  }
}
