import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  createWorkflowActionReceipt,
  computeWorkflowReplayOutputHash,
  normalizeWorkflowTrace,
  type WorkflowRegressionVector,
} from "./WorkflowTraceProtocol";
import {
  crystallizeWorkflow,
  evaluateWorkflowRegression,
  replayWorkflowCandidate,
} from "./WorkflowCrystallizer";

const revision = "a".repeat(40);
const provenance = {
  sourceKind: "issue" as const,
  sourceId: "issue-589",
  sourceRevision: revision,
  sourceHash: canonicalSha256({ issue: 589 }),
};
const steps = [
  {
    stepId: "collect",
    toolId: "read-files",
    inputHash: canonicalSha256(["files"]),
    outputHash: canonicalSha256(["evidence"]),
    effect: "read" as const,
    approvalRequired: false,
  },
  {
    stepId: "write",
    toolId: "prepare-fixture",
    inputHash: canonicalSha256(["evidence"]),
    outputHash: canonicalSha256(["fixture"]),
    effect: "workspace-write" as const,
    approvalRequired: true,
  },
];
const receipt = createWorkflowActionReceipt({
  receiptId: "receipt-589",
  stepId: "write",
  effect: "workspace-write",
  approvalGranted: true,
});
const vector: WorkflowRegressionVector = {
  vectorId: "vector-1",
  inputHash: canonicalSha256(["input"]),
  stepOutputs: steps.map(step => ({
    stepId: step.stepId,
    outputHash: step.outputHash,
  })),
  outputHash: computeWorkflowReplayOutputHash(
    steps,
    canonicalSha256(["input"])
  ),
};
const traceInput = {
  workflowId: "workflow-589",
  sourceRevision: revision,
  provenance,
  steps,
  regressionVectors: [vector],
  actionReceipts: [receipt],
};

describe("Issue #589 deterministic workflow crystallization", () => {
  it("normalizes, hashes and promotes a receipt-bound non-gameplay workflow", () => {
    const candidate = crystallizeWorkflow({
      ...traceInput,
      steps: [...steps].reverse(),
    });
    expect(candidate.status).toBe("PROMOTED");
    expect(candidate.steps.map(step => step.stepId)).toEqual([
      "collect",
      "write",
    ]);
    expect(replayWorkflowCandidate(candidate, vector)).toMatchObject({
      valid: true,
      vectorId: "vector-1",
      reason: null,
    });
  });

  it("automatically demotes on regression-vector drift", () => {
    const candidate = crystallizeWorkflow(traceInput);
    const changed = { ...vector, outputHash: canonicalSha256(["changed"]) };
    const result = evaluateWorkflowRegression(candidate, [changed]);
    expect(result.results[0]).toMatchObject({
      valid: false,
      reason: "REGRESSION_VECTOR_DRIFT",
    });
    expect(result.candidate.status).toBe("DEMOTED");
    expect(result.candidate.demotionReason).toBe("REGRESSION_VECTOR_DRIFT");
  });

  it("keeps action approval and receipt requirements fail-closed", () => {
    expect(() =>
      crystallizeWorkflow({ ...traceInput, actionReceipts: [] })
    ).toThrow("WORKFLOW_WRITE_RECEIPT_REQUIRED");
    expect(() =>
      crystallizeWorkflow({
        ...traceInput,
        steps: [{ ...steps[1]!, approvalRequired: false }],
      })
    ).toThrow("WORKFLOW_WRITE_APPROVAL_REQUIRED");
  });

  it("rejects secrets, revision drift, duplicate IDs and nondeterministic bounds", () => {
    expect(() =>
      normalizeWorkflowTrace({
        ...traceInput,
        provenance: { ...provenance, sourceId: "token:abc" },
      })
    ).toThrow("WORKFLOW_SECRET_IN_TRACE");
    expect(() =>
      crystallizeWorkflow({ ...traceInput, sourceRevision: "b".repeat(40) })
    ).toThrow("WORKFLOW_PROVENANCE_REVISION_MISMATCH");
    expect(() =>
      crystallizeWorkflow({ ...traceInput, steps: [steps[0]!, steps[0]!] })
    ).toThrow("WORKFLOW_STEP_ID_DUPLICATE");
    expect(() =>
      crystallizeWorkflow({
        ...traceInput,
        regressionVectors: Array.from({ length: 65 }, (_, index) => ({
          ...vector,
          vectorId: `vector-${index}`,
        })),
      })
    ).toThrow("WORKFLOW_REGRESSION_BOUND_INVALID");
  });

  it("does not create a gameplay or persistence mutation path", () => {
    const candidate = crystallizeWorkflow(traceInput);
    expect(
      candidate.steps.every(step =>
        ["read", "workspace-write", "external-write"].includes(step.effect)
      )
    ).toBe(true);
    expect(JSON.stringify(candidate)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(candidate)).not.toContain("gameplay");
  });
});
