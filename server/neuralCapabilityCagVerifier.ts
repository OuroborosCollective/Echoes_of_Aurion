import {
  AURION_NEURAL_CAPABILITY_CAG_PROTOCOL,
  AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
  NEURAL_CAPABILITY_INVARIANT,
  NEURAL_CAPABILITY_INVARIANT_CODES,
  buildNeuralCapabilityCagBoundedInput,
  computeArtifactSha256,
  computeDatasetSha256,
  computeSpecSha256,
  evaluateNeuralCapabilityInvariants,
  isSha256Prefixed,
  neuralCapabilityInvariantBitVector,
  sha256Prefixed,
  type NeuralCapabilityCagReport,
  type NeuralCapabilityDatasetEntry,
  type NeuralCapabilityDifferentialRecord,
  type NeuralCapabilityEvaluationRecord,
  type NeuralCapabilityIntentContract,
  type NeuralCapabilityInvariantReport,
  type NeuralCapabilityInvariantSummary,
} from "@shared/neuralCapabilityCagProtocol";
import { normalizeWolframComputeResult } from "./aurionCagDesignOracle";
import {
  requireWolframCagClient,
  wolframCagConfigurationStatus,
  type WolframCagClient,
  type WolframCagEvidence,
} from "./wolframCag";

export type NeuralCapabilityCagVerificationInput = Readonly<{
  capabilityId: string;
  contract: NeuralCapabilityIntentContract;
  dataset: readonly NeuralCapabilityDatasetEntry[];
  evaluations: readonly NeuralCapabilityEvaluationRecord[];
  differentials?: readonly NeuralCapabilityDifferentialRecord[];
  artifactManifest: unknown;
}>;

export type NeuralCapabilityCagVerificationOptions = Readonly<{
  client?: WolframCagClient;
  environment?: NodeJS.ProcessEnv;
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
    sourceBoundary: "bounded_spec_hash_dataset_differential";
    observedSummary: NeuralCapabilityInvariantSummary | null;
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
    if (!isSha256Prefixed(wanted) || wanted !== actual) throw new Error(`NEURAL_CAPABILITY_CAG_HASH_MISMATCH:${field}`);
  }
}

function escapeComment(value: string): string {
  return value.replace(/\(\*/g, "(/").replace(/\*\)/g, "/)");
}

function wlString(value: string): string {
  return JSON.stringify(value);
}

function wlList(values: readonly string[]): string {
  return "{" + values.join(",") + "}";
}

function wlStringRows(rows: readonly (readonly [string, string])[]): string {
  return wlList(rows.map(([a, b]) => `{${wlString(a)},${wlString(b)}}`));
}

function wlContextRows(rows: readonly (readonly [string, 0 | 1])[]): string {
  return wlList(rows.map(([a, b]) => `{${wlString(a)},${b}}`));
}

function wlDifferentialRows(rows: readonly (readonly [0 | 1, 0 | 1, string, string, 0 | 1, 0 | 1, 0 | 1, string, 0 | 1])[]): string {
  return wlList(rows.map(row => `{${row[0]},${row[1]},${wlString(row[2])},${wlString(row[3])},${row[4]},${row[5]},${row[6]},${wlString(row[7])},${row[8]}}`));
}

/**
 * Wolfram independently recomputes semantic-spec grounding, dataset conflict
 * families and legacy/neural/expected differential mismatches from bounded
 * material. Dataset text is represented only by hashes; gameplay state is absent.
 */
export function buildNeuralCapabilityCagProbe(
  report: NeuralCapabilityInvariantReport,
  input: NeuralCapabilityCagVerificationInput,
): string {
  const bits = neuralCapabilityInvariantBitVector(report);
  const bounded = buildNeuralCapabilityCagBoundedInput(input.contract, input.dataset, input.differentials ?? []);
  const aliases = wlList(bounded.specAliasGroups.map(group => wlList(group.map(wlString))));
  const payload = escapeComment(JSON.stringify({
    protocol: AURION_NEURAL_CAPABILITY_INVARIANT_PROTOCOL,
    resultHash: report.resultHash,
    differentialCount: input.differentials?.length ?? 0,
  }));
  return [
    "Module[{bits, baseMask, spec, aliasGroups, exactRows, nearRows, contextRows, diffRows,",
    " missingGrounding, unmentioned, conflictCount, exactConflicts, nearConflicts, contextConflicts, diffMismatches, mask},",
    " bits = {" + bits.slice(0, 9).join(",") + "};",
    " baseMask = Total[bits * 2^Range[0, Length[bits] - 1]];",
    " spec = " + wlString(bounded.normalizedSpec) + ";",
    " aliasGroups = " + aliases + ";",
    " exactRows = " + wlStringRows(bounded.exactDatasetRows) + ";",
    " nearRows = " + wlStringRows(bounded.nearDatasetRows) + ";",
    " contextRows = " + wlContextRows(bounded.contextRows) + ";",
    " diffRows = " + wlDifferentialRows(bounded.differentialRows) + ";",
    " missingGrounding = Count[aliasGroups, {}];",
    " unmentioned = Count[aliasGroups, group_ /; Length[group] > 0 && !AnyTrue[group, StringContainsQ[spec, #] &]];",
    " conflictCount[rows_] := Count[GatherBy[rows, First], group_ /; Length[DeleteDuplicates[group[[All, 2]]]] > 1];",
    " exactConflicts = conflictCount[exactRows];",
    " nearConflicts = conflictCount[nearRows];",
    " contextConflicts = conflictCount[contextRows];",
    " diffMismatches = Count[diffRows, row_ /; row[[1]] != row[[2]] || (row[[1]] == 1 && row[[2]] == 1 && row[[3]] != row[[4]]) || row[[5]] != row[[6]] || row[[1]] != row[[7]] || row[[3]] != row[[8]] || row[[5]] != row[[9]] || row[[2]] != row[[7]] || row[[4]] != row[[8]] || row[[6]] != row[[9]]];",
    " mask = baseMask",
    `   + If[missingGrounding > 0, ${NEURAL_CAPABILITY_INVARIANT.CONTRACT_SPEC_GROUNDING_MISSING}, 0]`,
    `   + If[unmentioned > 0, ${NEURAL_CAPABILITY_INVARIANT.CONTRACT_SPEC_INTENT_UNMENTIONED}, 0]`,
    `   + If[exactConflicts > 0, ${NEURAL_CAPABILITY_INVARIANT.DATASET_CONFLICTING_LABEL}, 0]`,
    `   + If[nearConflicts > 0, ${NEURAL_CAPABILITY_INVARIANT.DATASET_NEAR_DUPLICATE_CONFLICT}, 0]`,
    `   + If[contextConflicts > 0, ${NEURAL_CAPABILITY_INVARIANT.DATASET_CONTEXT_CONTRADICTION}, 0]`,
    `   + If[diffMismatches > 0, BitOr[${NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_DECISION_MISMATCH}, ${NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_ACCEPTED_INTENT_MISMATCH}, ${NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_CONTEXT_MISMATCH}, ${NEURAL_CAPABILITY_INVARIANT.DIFFERENTIAL_EXPECTATION_MISMATCH}], 0];`,
    " {mask, " + NEURAL_CAPABILITY_INVARIANT_CODES.length + ", missingGrounding + unmentioned, exactConflicts, nearConflicts, contextConflicts, diffMismatches}",
    "]",
    "(* " + payload + " *)",
  ].join("\n");
}

function parseProbeResult(value: string, expectedBitCount: number): Readonly<{ mask: number; summary: NeuralCapabilityInvariantSummary }> {
  const normalized = normalizeWolframComputeResult(value);
  const match = /^\{(-?[0-9]+),(-?[0-9]+),(-?[0-9]+),(-?[0-9]+),(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)\}$/.exec(normalized);
  if (!match) throw new Error("NEURAL_CAPABILITY_CAG_RESULT_FORMAT");
  const values = match.slice(1).map(Number);
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("NEURAL_CAPABILITY_CAG_RESULT_BOUNDS");
  const [mask, bitCount, specMissingCount, datasetConflictCount, nearDuplicateConflictCount, contextContradictionCount, differentialMismatchCount] = values;
  if (bitCount !== expectedBitCount || mask > (2 ** expectedBitCount) - 1) throw new Error("NEURAL_CAPABILITY_CAG_RESULT_BOUNDS");
  return Object.freeze({
    mask,
    summary: Object.freeze({ specMissingCount, datasetConflictCount, nearDuplicateConflictCount, contextContradictionCount, differentialMismatchCount }),
  });
}

export async function verifyNeuralCapabilityWithCag(
  input: NeuralCapabilityCagVerificationInput,
  options: NeuralCapabilityCagVerificationOptions = {},
): Promise<NeuralCapabilityCagVerification> {
  const differentials = input.differentials ?? [];
  const localReport = evaluateNeuralCapabilityInvariants(input.contract, input.dataset, input.evaluations, differentials);
  const artifactSha256 = computeArtifactSha256(input.artifactManifest);
  const specSha256 = computeSpecSha256(input.contract);
  const datasetSha256 = computeDatasetSha256(input.dataset);
  verifyPinnedHashes({ artifactSha256, specSha256, datasetSha256 }, options.expectedHashes);

  const code = buildNeuralCapabilityCagProbe(localReport, input);
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
    sourceBoundary: "bounded_spec_hash_dataset_differential" as const,
  };
  const finish = (
    status: NeuralCapabilityCagVerification["status"],
    responseSha256: string | null,
    observedMask: number | null,
    cagEvidence: WolframCagEvidence | null,
    observedSummary: NeuralCapabilityInvariantSummary | null,
  ): NeuralCapabilityCagVerification => Object.freeze({ ...base, status, responseSha256, observedMask, cagEvidence, observedSummary });

  if (input.dataset.length === 0 && input.evaluations.length === 0 && differentials.length === 0) {
    return finish("INSUFFICIENT_EVIDENCE", null, null, null, null);
  }

  let client = options.client;
  if (!client) {
    const configuration = wolframCagConfigurationStatus(options.environment ?? process.env);
    if (!configuration.configured) return finish("NOT_CONFIGURED", null, null, null, null);
    try {
      client = requireWolframCagClient(options.environment ?? process.env);
    } catch {
      return finish("PROVIDER_FAILED", null, null, null, null);
    }
  }

  let evidence: WolframCagEvidence;
  try {
    evidence = await client.languageCompute({ code, timeConstraint: 10, maxChars: 1024 });
  } catch {
    return finish("PROVIDER_FAILED", null, null, null, null);
  }

  try {
    const observed = parseProbeResult(evidence.result, NEURAL_CAPABILITY_INVARIANT_CODES.length);
    const summaryMatches = JSON.stringify(observed.summary) === JSON.stringify(localReport.summary);
    return finish(
      observed.mask === localReport.mask && summaryMatches ? "MATCH" : "FALSIFIED",
      evidence.responseSha256,
      observed.mask,
      evidence,
      observed.summary,
    );
  } catch {
    return finish("PROVIDER_FAILED", evidence.responseSha256, null, evidence, null);
  }
}
