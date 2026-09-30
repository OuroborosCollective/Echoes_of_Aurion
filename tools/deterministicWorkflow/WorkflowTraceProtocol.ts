import {
  canonicalJson,
  canonicalSha256,
  domainSha256,
} from "../../shared/aurionCanonicalHash";

export const WORKFLOW_TRACE_SCHEMA =
  "aurion.deterministic-workflow-trace.v1" as const;
export const WORKFLOW_CANDIDATE_SCHEMA =
  "aurion.deterministic-workflow-candidate.v1" as const;
export const WORKFLOW_ACTION_RECEIPT_SCHEMA =
  "aurion.deterministic-workflow-action-receipt.v1" as const;
export const MAX_WORKFLOW_STEPS = 128;
export const MAX_REGRESSION_VECTORS = 64;

const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z][A-Za-z0-9._:-]{0,95}$/;
const SECRET_KEY =
  /(api[_-]?key|authorization|bearer|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE =
  /(-----BEGIN .* PRIVATE KEY-----|bearer\s+[A-Za-z0-9._-]+|(?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*[^\s,;]+)/i;

type Effect = "read" | "workspace-write" | "external-write";
export type WorkflowEffect = Effect;

export type WorkflowStep = Readonly<{
  stepId: string;
  toolId: string;
  inputHash: string;
  outputHash: string;
  effect: Effect;
  approvalRequired: boolean;
}>;

export type WorkflowProvenance = Readonly<{
  sourceKind: "issue" | "operator" | "external-instruction";
  sourceId: string;
  sourceRevision: string;
  sourceHash: string;
}>;

export type WorkflowRegressionVector = Readonly<{
  vectorId: string;
  inputHash: string;
  stepOutputs: readonly Readonly<{ stepId: string; outputHash: string }>[];
  outputHash: string;
}>;

export type WorkflowActionReceipt = Readonly<{
  schema: typeof WORKFLOW_ACTION_RECEIPT_SCHEMA;
  receiptId: string;
  stepId: string;
  effect: Effect;
  approvalGranted: boolean;
  receiptHash: string;
}>;

export type WorkflowTrace = Readonly<{
  schema: typeof WORKFLOW_TRACE_SCHEMA;
  workflowId: string;
  sourceRevision: string;
  provenance: WorkflowProvenance;
  steps: readonly WorkflowStep[];
  regressionVectors: readonly WorkflowRegressionVector[];
  actionReceipts: readonly WorkflowActionReceipt[];
  traceHash: string;
}>;

export type WorkflowCandidateStatus = "PROMOTED" | "DEMOTED";

export type WorkflowCandidate = Readonly<{
  schema: typeof WORKFLOW_CANDIDATE_SCHEMA;
  workflowId: string;
  sourceRevision: string;
  provenance: WorkflowProvenance;
  steps: readonly WorkflowStep[];
  regressionVectors: readonly WorkflowRegressionVector[];
  actionReceipts: readonly WorkflowActionReceipt[];
  traceHash: string;
  status: WorkflowCandidateStatus;
  demotionReason: string | null;
  candidateHash: string;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function requireId(value: string, code: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(code);
  return value;
}

function requireHash(value: string, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function requireRevision(value: string, code: string): string {
  if (typeof value !== "string" || !REVISION.test(value)) fail(code);
  return value;
}

function containsSecret(value: unknown, key = ""): boolean {
  if (SECRET_KEY.test(key)) return true;
  if (typeof value === "string") return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(item => containsSecret(item));
  if (value && typeof value === "object")
    return Object.entries(value).some(([childKey, child]) =>
      containsSecret(child, childKey)
    );
  return false;
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function validateStep(step: WorkflowStep): WorkflowStep {
  requireId(step.stepId, "WORKFLOW_STEP_ID_INVALID");
  requireId(step.toolId, "WORKFLOW_TOOL_ID_INVALID");
  requireHash(step.inputHash, "WORKFLOW_STEP_INPUT_HASH_INVALID");
  requireHash(step.outputHash, "WORKFLOW_STEP_OUTPUT_HASH_INVALID");
  if (
    step.effect !== "read" &&
    step.effect !== "workspace-write" &&
    step.effect !== "external-write"
  )
    fail("WORKFLOW_STEP_EFFECT_INVALID");
  if (typeof step.approvalRequired !== "boolean")
    fail("WORKFLOW_STEP_APPROVAL_FLAG_INVALID");
  if (step.effect !== "read" && !step.approvalRequired)
    fail("WORKFLOW_WRITE_APPROVAL_REQUIRED");
  return freeze({ ...step });
}

function validateProvenance(
  provenance: WorkflowProvenance
): WorkflowProvenance {
  if (
    !["issue", "operator", "external-instruction"].includes(
      provenance.sourceKind
    )
  )
    fail("WORKFLOW_PROVENANCE_KIND_INVALID");
  requireId(provenance.sourceId, "WORKFLOW_PROVENANCE_SOURCE_ID_INVALID");
  requireRevision(
    provenance.sourceRevision,
    "WORKFLOW_PROVENANCE_REVISION_INVALID"
  );
  requireHash(provenance.sourceHash, "WORKFLOW_PROVENANCE_HASH_INVALID");
  return freeze({ ...provenance });
}

function validateReceipt(
  receipt: WorkflowActionReceipt
): WorkflowActionReceipt {
  requireId(receipt.receiptId, "WORKFLOW_RECEIPT_ID_INVALID");
  requireId(receipt.stepId, "WORKFLOW_RECEIPT_STEP_ID_INVALID");
  if (receipt.schema !== WORKFLOW_ACTION_RECEIPT_SCHEMA)
    fail("WORKFLOW_RECEIPT_SCHEMA_INVALID");
  if (!["read", "workspace-write", "external-write"].includes(receipt.effect))
    fail("WORKFLOW_RECEIPT_EFFECT_INVALID");
  if (typeof receipt.approvalGranted !== "boolean")
    fail("WORKFLOW_RECEIPT_APPROVAL_FLAG_INVALID");
  requireHash(receipt.receiptHash, "WORKFLOW_RECEIPT_HASH_INVALID");
  const expected = canonicalSha256({
    schema: WORKFLOW_ACTION_RECEIPT_SCHEMA,
    receiptId: receipt.receiptId,
    stepId: receipt.stepId,
    effect: receipt.effect,
    approvalGranted: receipt.approvalGranted,
  });
  if (receipt.receiptHash !== expected) fail("WORKFLOW_RECEIPT_HASH_MISMATCH");
  if (receipt.effect !== "read" && !receipt.approvalGranted)
    fail("WORKFLOW_RECEIPT_APPROVAL_REQUIRED");
  return freeze({ ...receipt });
}

function validateVector(
  vector: WorkflowRegressionVector,
  steps: readonly WorkflowStep[]
): WorkflowRegressionVector {
  requireId(vector.vectorId, "WORKFLOW_VECTOR_ID_INVALID");
  requireHash(vector.inputHash, "WORKFLOW_VECTOR_INPUT_HASH_INVALID");
  requireHash(vector.outputHash, "WORKFLOW_VECTOR_OUTPUT_HASH_INVALID");
  if (
    !Array.isArray(vector.stepOutputs) ||
    vector.stepOutputs.length !== steps.length
  )
    fail("WORKFLOW_VECTOR_STEP_COUNT_MISMATCH");
  const expectedStepIds = steps.map(step => step.stepId);
  const actualStepIds = vector.stepOutputs.map(step => step.stepId);
  if (canonicalJson(actualStepIds) !== canonicalJson(expectedStepIds))
    fail("WORKFLOW_VECTOR_STEP_ORDER_INVALID");
  for (const [index, output] of vector.stepOutputs.entries()) {
    requireId(output.stepId, "WORKFLOW_VECTOR_STEP_ID_INVALID");
    requireHash(output.outputHash, "WORKFLOW_VECTOR_STEP_OUTPUT_HASH_INVALID");
    if (output.outputHash !== steps[index]!.outputHash)
      fail("WORKFLOW_VECTOR_STEP_OUTPUT_DRIFT");
  }
  if (
    vector.outputHash !==
    computeWorkflowReplayOutputHash(steps, vector.inputHash)
  )
    fail("WORKFLOW_VECTOR_OUTPUT_DRIFT");
  return freeze({
    vectorId: vector.vectorId,
    inputHash: vector.inputHash,
    stepOutputs: freeze(
      vector.stepOutputs.map(output => freeze({ ...output }))
    ),
    outputHash: vector.outputHash,
  });
}

export function createWorkflowActionReceipt(
  input: Omit<WorkflowActionReceipt, "schema" | "receiptHash">
): WorkflowActionReceipt {
  if (input.effect !== "read" && !input.approvalGranted)
    fail("WORKFLOW_RECEIPT_APPROVAL_REQUIRED");
  return validateReceipt(
    freeze({
      ...input,
      schema: WORKFLOW_ACTION_RECEIPT_SCHEMA,
      receiptHash: canonicalSha256({
        schema: WORKFLOW_ACTION_RECEIPT_SCHEMA,
        receiptId: input.receiptId,
        stepId: input.stepId,
        effect: input.effect,
        approvalGranted: input.approvalGranted,
      }),
    })
  );
}

export function computeWorkflowReplayOutputHash(
  steps: readonly WorkflowStep[],
  inputHash: string
): string {
  requireHash(inputHash, "WORKFLOW_REPLAY_INPUT_HASH_INVALID");
  return domainSha256("aurion.deterministic-workflow-replay.v1", [
    inputHash,
    steps.map(step => ({
      stepId: step.stepId,
      toolId: step.toolId,
      inputHash: step.inputHash,
      outputHash: step.outputHash,
      effect: step.effect,
      approvalRequired: step.approvalRequired,
    })),
  ]);
}

export function normalizeWorkflowTrace(
  input: Omit<WorkflowTrace, "schema" | "traceHash">
): WorkflowTrace {
  if (containsSecret(input)) fail("WORKFLOW_SECRET_IN_TRACE");
  requireId(input.workflowId, "WORKFLOW_ID_INVALID");
  requireRevision(input.sourceRevision, "WORKFLOW_SOURCE_REVISION_INVALID");
  const provenance = validateProvenance(input.provenance);
  if (provenance.sourceRevision !== input.sourceRevision)
    fail("WORKFLOW_PROVENANCE_REVISION_MISMATCH");
  if (
    !Array.isArray(input.steps) ||
    input.steps.length === 0 ||
    input.steps.length > MAX_WORKFLOW_STEPS
  )
    fail("WORKFLOW_STEP_BOUND_INVALID");
  if (
    !Array.isArray(input.regressionVectors) ||
    input.regressionVectors.length === 0 ||
    input.regressionVectors.length > MAX_REGRESSION_VECTORS
  )
    fail("WORKFLOW_REGRESSION_BOUND_INVALID");
  const steps = input.steps
    .map(validateStep)
    .sort((left, right) => left.stepId.localeCompare(right.stepId));
  if (new Set(steps.map(step => step.stepId)).size !== steps.length)
    fail("WORKFLOW_STEP_ID_DUPLICATE");
  const vectors = input.regressionVectors
    .map(vector => validateVector(vector, steps))
    .sort((left, right) => left.vectorId.localeCompare(right.vectorId));
  if (new Set(vectors.map(vector => vector.vectorId)).size !== vectors.length)
    fail("WORKFLOW_VECTOR_ID_DUPLICATE");
  const receipts = input.actionReceipts
    .map(validateReceipt)
    .sort(
      (left, right) =>
        left.stepId.localeCompare(right.stepId) ||
        left.receiptId.localeCompare(right.receiptId)
    );
  for (const step of steps.filter(candidate => candidate.effect !== "read")) {
    const receipt = receipts.find(
      candidate =>
        candidate.stepId === step.stepId && candidate.effect === step.effect
    );
    if (!receipt || !receipt.approvalGranted)
      fail("WORKFLOW_WRITE_RECEIPT_REQUIRED");
  }
  const unsigned = {
    schema: WORKFLOW_TRACE_SCHEMA,
    workflowId: input.workflowId,
    sourceRevision: input.sourceRevision,
    provenance,
    steps,
    regressionVectors: vectors,
    actionReceipts: receipts,
  };
  return freeze({ ...unsigned, traceHash: canonicalSha256(unsigned) });
}

export function assertWorkflowTraceReplay(trace: WorkflowTrace): void {
  if (
    trace.schema !== WORKFLOW_TRACE_SCHEMA ||
    trace.traceHash !==
      canonicalSha256({
        schema: trace.schema,
        workflowId: trace.workflowId,
        sourceRevision: trace.sourceRevision,
        provenance: trace.provenance,
        steps: trace.steps,
        regressionVectors: trace.regressionVectors,
        actionReceipts: trace.actionReceipts,
      })
  )
    fail("WORKFLOW_TRACE_HASH_MISMATCH");
  for (const vector of trace.regressionVectors)
    validateVector(vector, trace.steps);
}
