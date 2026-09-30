import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  computeWorkflowReplayOutputHash,
  createWorkflowActionReceipt,
  type WorkflowRegressionVector,
} from "./WorkflowTraceProtocol";
import {
  crystallizeWorkflow,
  evaluateWorkflowRegression,
} from "./WorkflowCrystallizer";

const revision = "c".repeat(40);
const step = {
  stepId: "inspect",
  toolId: "diagnostic-read",
  inputHash: canonicalSha256("input"),
  outputHash: canonicalSha256("output"),
  effect: "read" as const,
  approvalRequired: false,
};
const vector: WorkflowRegressionVector = {
  vectorId: "regression-1",
  inputHash: canonicalSha256("input"),
  stepOutputs: [{ stepId: step.stepId, outputHash: step.outputHash }],
  outputHash: computeWorkflowReplayOutputHash([step], canonicalSha256("input")),
};

function candidate() {
  return crystallizeWorkflow({
    workflowId: "workflow-regression-gate",
    sourceRevision: revision,
    provenance: {
      sourceKind: "operator",
      sourceId: "operator-589",
      sourceRevision: revision,
      sourceHash: canonicalSha256("operator"),
    },
    steps: [step],
    regressionVectors: [vector],
    actionReceipts: [
      createWorkflowActionReceipt({
        receiptId: "receipt-read",
        stepId: step.stepId,
        effect: "read",
        approvalGranted: false,
      }),
    ],
  });
}

describe("Issue #589 workflow regression gate", () => {
  it("keeps an exact replay promoted", () => {
    const current = candidate();
    const result = evaluateWorkflowRegression(current, [vector]);
    expect(result.candidate.status).toBe("PROMOTED");
    expect(result.results).toEqual([
      {
        valid: true,
        vectorId: "regression-1",
        outputHash: vector.outputHash,
        reason: null,
      },
    ]);
  });

  it("demotes without executing or authorizing the changed output", () => {
    const current = candidate();
    const drifted = {
      ...vector,
      stepOutputs: [
        { stepId: step.stepId, outputHash: canonicalSha256("drift") },
      ],
    };
    const result = evaluateWorkflowRegression(current, [drifted]);
    expect(result.candidate.status).toBe("DEMOTED");
    expect(result.candidate.demotionReason).toBe(
      "REGRESSION_STEP_OUTPUT_DRIFT"
    );
    expect(result.candidate.actionReceipts).toHaveLength(1);
  });
});
