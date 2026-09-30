import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  assertWorkflowTraceReplay,
  normalizeWorkflowTrace,
  type WorkflowCandidate,
  type WorkflowRegressionVector,
  type WorkflowTrace,
  WORKFLOW_CANDIDATE_SCHEMA,
  computeWorkflowReplayOutputHash,
} from "./WorkflowTraceProtocol";

export type WorkflowReplayResult = Readonly<{
  valid: boolean;
  vectorId: string;
  outputHash: string | null;
  reason: string | null;
}>;

function candidateHash(
  candidate: Omit<WorkflowCandidate, "candidateHash">
): string {
  return canonicalSha256(candidate);
}

function candidateFromTrace(
  trace: WorkflowTrace,
  status: WorkflowCandidate["status"],
  demotionReason: string | null
): WorkflowCandidate {
  const unsigned = {
    schema: WORKFLOW_CANDIDATE_SCHEMA,
    workflowId: trace.workflowId,
    sourceRevision: trace.sourceRevision,
    provenance: trace.provenance,
    steps: trace.steps,
    regressionVectors: trace.regressionVectors,
    actionReceipts: trace.actionReceipts,
    traceHash: trace.traceHash,
    status,
    demotionReason,
  } satisfies Omit<WorkflowCandidate, "candidateHash">;
  return Object.freeze({ ...unsigned, candidateHash: candidateHash(unsigned) });
}

export function crystallizeWorkflow(
  input: Parameters<typeof normalizeWorkflowTrace>[0]
): WorkflowCandidate {
  const trace = normalizeWorkflowTrace(input);
  assertWorkflowTraceReplay(trace);
  return candidateFromTrace(trace, "PROMOTED", null);
}

export function replayWorkflowCandidate(
  candidate: WorkflowCandidate,
  vector: WorkflowRegressionVector
): WorkflowReplayResult {
  if (candidate.schema !== WORKFLOW_CANDIDATE_SCHEMA)
    return {
      valid: false,
      vectorId: vector.vectorId,
      outputHash: null,
      reason: "CANDIDATE_SCHEMA_INVALID",
    };
  if (candidate.status !== "PROMOTED")
    return {
      valid: false,
      vectorId: vector.vectorId,
      outputHash: null,
      reason: "CANDIDATE_DEMOTED",
    };
  if (
    candidate.candidateHash !==
    candidateHash({
      schema: candidate.schema,
      workflowId: candidate.workflowId,
      sourceRevision: candidate.sourceRevision,
      provenance: candidate.provenance,
      steps: candidate.steps,
      regressionVectors: candidate.regressionVectors,
      actionReceipts: candidate.actionReceipts,
      traceHash: candidate.traceHash,
      status: candidate.status,
      demotionReason: candidate.demotionReason,
    })
  )
    return {
      valid: false,
      vectorId: vector.vectorId,
      outputHash: null,
      reason: "CANDIDATE_HASH_MISMATCH",
    };
  const stored = candidate.regressionVectors.find(
    item => item.vectorId === vector.vectorId
  );
  if (!stored)
    return {
      valid: false,
      vectorId: vector.vectorId,
      outputHash: null,
      reason: "REGRESSION_VECTOR_MISSING",
    };
  if (
    stored.inputHash !== vector.inputHash ||
    stored.outputHash !== vector.outputHash
  )
    return {
      valid: false,
      vectorId: vector.vectorId,
      outputHash: null,
      reason: "REGRESSION_VECTOR_DRIFT",
    };
  if (JSON.stringify(stored.stepOutputs) !== JSON.stringify(vector.stepOutputs))
    return {
      valid: false,
      vectorId: vector.vectorId,
      outputHash: null,
      reason: "REGRESSION_STEP_OUTPUT_DRIFT",
    };
  const outputHash = computeWorkflowReplayOutputHash(
    candidate.steps,
    vector.inputHash
  );
  return outputHash === vector.outputHash
    ? { valid: true, vectorId: vector.vectorId, outputHash, reason: null }
    : {
        valid: false,
        vectorId: vector.vectorId,
        outputHash,
        reason: "REPLAY_OUTPUT_DRIFT",
      };
}

export function evaluateWorkflowRegression(
  candidate: WorkflowCandidate,
  vectors: readonly WorkflowRegressionVector[]
): { candidate: WorkflowCandidate; results: readonly WorkflowReplayResult[] } {
  const results = vectors.map(vector =>
    replayWorkflowCandidate(candidate, vector)
  );
  const failure = results.find(result => !result.valid);
  if (!failure) return { candidate, results: Object.freeze(results) };
  const trace: WorkflowTrace = {
    schema: "aurion.deterministic-workflow-trace.v1",
    workflowId: candidate.workflowId,
    sourceRevision: candidate.sourceRevision,
    provenance: candidate.provenance,
    steps: candidate.steps,
    regressionVectors: candidate.regressionVectors,
    actionReceipts: candidate.actionReceipts,
    traceHash: candidate.traceHash,
  };
  return {
    candidate: candidateFromTrace(trace, "DEMOTED", failure.reason),
    results: Object.freeze(results),
  };
}
